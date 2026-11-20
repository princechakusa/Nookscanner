"""Stage 6.2: run one job end to end against the platform (contract v2, ADR-016).

download parts (verify sizes) -> join each input -> provider.run (pipeline) -> ask the platform for
signed upload URLs for the produced files -> upload -> succeeded event with SHA-256 per file.
Any failure is reported as a `failed` event, classified transient (retry) or permanent.
Every callback is HMAC-signed (signing.py, threat T09). Stdlib only.
"""

from __future__ import annotations

import hashlib
import json
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Protocol

from .contract import (
    JobRequest,
    failed_event,
    progress_event,
    succeeded_event,
    upload_urls_event,
)
from .pipeline import PipelineError
from .signing import sign_payload

TIMESTAMP_HEADER = "x-nookscanner-timestamp"
SIGNATURE_HEADER = "x-nookscanner-signature"
CHUNK = 1024 * 1024

# Failures worth another attempt (network, platform, capacity). Everything else is permanent:
# retrying a bad video or an unreconstructable scene only burns GPU money.
TRANSIENT_CODES = frozenset(
    {"DOWNLOAD_FAILED", "UPLOAD_FAILED", "CALLBACK_FAILED", "GPU_UNAVAILABLE", "WORKER_TIMEOUT", "INTERNAL_ERROR"}
)


class TransportError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class Transport(Protocol):
    def post_event(self, event: dict[str, Any]) -> dict[str, Any]: ...
    def download(self, url: str, dest: Path) -> None: ...
    def upload(self, url: str, src: Path, content_type: str) -> None: ...


class HttpTransport:
    """urllib transport: signed JSON callbacks, streamed downloads and PUT uploads."""

    def __init__(self, callback_url: str, secret: str, timeout: float = 120.0) -> None:
        self.callback_url = callback_url
        self.secret = secret
        self.timeout = timeout

    def post_event(self, event: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(event, separators=(",", ":"))
        ts = int(time.time())
        req = urllib.request.Request(
            self.callback_url,
            data=body.encode(),
            method="POST",
            headers={
                "content-type": "application/json",
                TIMESTAMP_HEADER: str(ts),
                SIGNATURE_HEADER: sign_payload(self.secret, ts, body),
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:  # noqa: S310 (https enforced by contract)
                return json.loads(res.read() or b"{}")
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            raise TransportError("CALLBACK_FAILED", f"callback failed: {exc}") from exc

    def download(self, url: str, dest: Path) -> None:
        try:
            with urllib.request.urlopen(url, timeout=self.timeout) as res, dest.open("wb") as fh:  # noqa: S310
                while chunk := res.read(CHUNK):
                    fh.write(chunk)
        except (urllib.error.URLError, TimeoutError) as exc:
            raise TransportError("DOWNLOAD_FAILED", f"download failed: {exc}") from exc

    def upload(self, url: str, src: Path, content_type: str) -> None:
        req = urllib.request.Request(
            url, data=src.read_bytes(), method="PUT", headers={"content-type": content_type}
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout):  # noqa: S310
                pass
        except (urllib.error.URLError, TimeoutError) as exc:
            raise TransportError("UPLOAD_FAILED", f"upload failed: {exc}") from exc


CONTENT_TYPES = {
    ".sog": "application/octet-stream",
    ".json": "application/json",
    ".webp": "image/webp",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".spz": "application/octet-stream",
    ".ply": "application/octet-stream",
}

Provider = Callable[[JobRequest, list[Path], Path, Callable[[str, float], None]], dict[str, Any]]


@dataclass
class RunResult:
    succeeded: bool
    code: str | None = None


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as fh:
        while chunk := fh.read(CHUNK):
            h.update(chunk)
    return h.hexdigest()


def fetch_inputs(job: JobRequest, transport: Transport, workdir: Path) -> list[Path]:
    """Downloads every part, checks its size, and joins parts into one file per input."""
    videos = []
    parts_dir = workdir / "parts"
    parts_dir.mkdir(parents=True, exist_ok=True)
    for i, item in enumerate(job.inputs):
        ext = ".mov" if item.mime == "video/quicktime" else ".mp4"
        joined = workdir / f"input_{i}{ext}"
        if joined.exists() and joined.stat().st_size == item.size_bytes:
            videos.append(joined)  # resumed attempt
            continue
        with joined.open("wb") as out:
            for part in item.parts:
                p = parts_dir / f"{i}_{part.part_number:04d}"
                if not (p.exists() and p.stat().st_size == part.size_bytes):
                    transport.download(part.download_url, p)
                if p.stat().st_size != part.size_bytes:
                    raise TransportError(
                        "DOWNLOAD_FAILED", f"part {part.part_number} of input {i} has the wrong size"
                    )
                with p.open("rb") as fh:
                    while chunk := fh.read(CHUNK):
                        out.write(chunk)
        if joined.stat().st_size != item.size_bytes:
            raise TransportError("DOWNLOAD_FAILED", f"input {i} does not add up to its declared size")
        videos.append(joined)
    return videos


def collect_outputs(outdir: Path) -> list[dict[str, Any]]:
    files = []
    for p in sorted(outdir.rglob("*")):
        if p.is_file():
            rel = p.relative_to(outdir).as_posix()
            files.append({"path": rel, "sizeBytes": p.stat().st_size, "local": p})
    return files


def run_job(job: JobRequest, transport: Transport, workdir: Path, provider: Provider) -> RunResult:
    """Never raises: every outcome is reported to the platform (best effort for the last event)."""

    def progress(stage: str, fraction: float) -> None:
        transport.post_event(progress_event(job, stage, fraction * 100))

    try:
        progress("downloading", 0.01)
        videos = fetch_inputs(job, transport, workdir)
        def pipeline_progress(stage: str, fraction: float) -> None:
            # The pipeline reports 0..1 over its own stages; it maps to 5..90 % of the job.
            # Its final "done" is not the job's: uploading still follows.
            if stage != "done":
                progress(stage, 0.05 + max(0.0, min(1.0, fraction)) * 0.85)

        report = provider(job, videos, workdir, pipeline_progress)
        progress("uploading", 0.92)
        outdir = workdir / "package"
        files = collect_outputs(outdir)
        if not files:
            raise PipelineError("TRAINING_NO_OUTPUT", "The pipeline produced no files to publish.")
        answer = transport.post_event(upload_urls_event(job, files))
        urls = {u["path"]: u["url"] for u in answer.get("uploads", [])}
        for f in files:
            url = urls.get(f["path"])
            if not url:
                raise TransportError("UPLOAD_FAILED", f"no upload URL for {f['path']}")
            transport.upload(url, f["local"], CONTENT_TYPES.get(f["local"].suffix, "application/octet-stream"))
        published = [{"path": f["path"], "sizeBytes": f["sizeBytes"], "sha256": _sha256(f["local"])} for f in files]
        transport.post_event(succeeded_event(job, published, report))
        return RunResult(True)
    except PipelineError as exc:
        return _fail(job, transport, exc.code, str(exc))
    except TransportError as exc:
        return _fail(job, transport, exc.code, str(exc))
    except Exception as exc:  # noqa: BLE001 - last line of defence, reported as transient
        return _fail(job, transport, "INTERNAL_ERROR", f"{type(exc).__name__}")


def _fail(job: JobRequest, transport: Transport, code: str, message: str) -> RunResult:
    try:
        transport.post_event(failed_event(job, code, message, code in TRANSIENT_CODES))
    except TransportError:
        pass  # platform unreachable: the stalled-job sweep re-queues the job (WORKER_TIMEOUT)
    return RunResult(False, code)
