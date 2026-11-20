"""Job contract v2, mirrored from packages/shared/src/processing.ts (docs/API_SPECIFICATION.md s6).

Both sides validate the same fixture (packages/shared/src/fixtures/job-request-v2.json) in their
tests, so they cannot drift. Stdlib only.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Any

CONTRACT_VERSION = 2
PROVIDERS = ("self_hosted_gsplat", "varjo_teleport")
JOB_STAGES = (
    "queued", "downloading", "validating", "extracting_frames", "estimating_poses",
    "training", "compressing", "uploading", "reporting", "done",
)
MAX_PART_BYTES = 47_185_920
MAX_UPLOAD_BYTES = 10_737_418_240
TIERS = ("T1", "T2", "T3", "T4", "T5")

_OUTPUT_PATH = re.compile(
    r"^(?:[a-z0-9][a-z0-9_.-]{0,63}/){0,3}[a-z0-9][a-z0-9_.-]{0,63}\.(?:sog|json|webp|ply|spz|png|jpg)$"
)
_CODE = re.compile(r"^[A-Z0-9_]{2,60}$")
_TOP_KEYS = {"contractVersion", "jobId", "attempt", "organizationId", "apartmentId", "provider",
             "inputs", "callbackUrl", "parameters"}


class ContractError(ValueError):
    """Raised when a job request does not satisfy the contract."""


def is_safe_output_path(p: str) -> bool:
    return bool(_OUTPUT_PATH.match(p)) and not any(s == ".." or s.startswith(".") for s in p.split("/"))


def _uuid(value: Any, field: str) -> str:
    try:
        parsed = uuid.UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ContractError(f"{field} must be a UUID") from exc
    if str(parsed) != str(value).lower():
        raise ContractError(f"{field} must be a UUID")
    return str(parsed)


def _https(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.startswith("https://"):
        raise ContractError(f"{field} must be an https URL")
    return value


def _int(value: Any, field: str, lo: int, hi: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not lo <= value <= hi:
        raise ContractError(f"{field} must be an integer in [{lo}, {hi}]")
    return value


@dataclass(frozen=True)
class InputPart:
    part_number: int
    size_bytes: int
    download_url: str


@dataclass(frozen=True)
class JobInput:
    upload_id: str
    mime: str
    size_bytes: int
    parts: tuple[InputPart, ...]


@dataclass(frozen=True)
class JobRequest:
    job_id: str
    attempt: int
    organization_id: str
    apartment_id: str
    provider: str
    inputs: tuple[JobInput, ...]
    callback_url: str
    max_gaussians: int
    training_steps: int
    frame_sample_fps: float
    capture_tier: str | None


def parse_job_request(data: dict[str, Any]) -> JobRequest:
    if not isinstance(data, dict) or set(data) - _TOP_KEYS:
        raise ContractError("unknown fields")
    if data.get("contractVersion") != CONTRACT_VERSION:
        raise ContractError("unsupported contractVersion")
    provider = data.get("provider")
    if provider not in PROVIDERS:
        raise ContractError("unknown provider")
    raw_inputs = data.get("inputs")
    if not isinstance(raw_inputs, list) or not 1 <= len(raw_inputs) <= 20:
        raise ContractError("inputs must contain 1..20 items")
    inputs = []
    for i, item in enumerate(raw_inputs):
        if item.get("mime") not in ("video/mp4", "video/quicktime"):
            raise ContractError(f"inputs[{i}].mime invalid")
        size = _int(item.get("sizeBytes"), f"inputs[{i}].sizeBytes", 1, MAX_UPLOAD_BYTES)
        raw_parts = item.get("parts")
        if not isinstance(raw_parts, list) or not 1 <= len(raw_parts) <= 1000:
            raise ContractError(f"inputs[{i}].parts must contain 1..1000 items")
        parts = []
        for n, p in enumerate(raw_parts, start=1):
            if _int(p.get("partNumber"), f"inputs[{i}].parts[{n - 1}].partNumber", 1, 1000) != n:
                raise ContractError("parts must be numbered 1..n")
            parts.append(InputPart(
                part_number=n,
                size_bytes=_int(p.get("sizeBytes"), f"inputs[{i}].parts[{n - 1}].sizeBytes", 1, MAX_PART_BYTES),
                download_url=_https(p.get("downloadUrl"), f"inputs[{i}].parts[{n - 1}].downloadUrl"),
            ))
        if sum(p.size_bytes for p in parts) != size:
            raise ContractError(f"inputs[{i}] parts do not add up to sizeBytes")
        inputs.append(JobInput(_uuid(item.get("uploadId"), f"inputs[{i}].uploadId"), item["mime"], size, tuple(parts)))
    params = data.get("parameters") or {}
    fps = params.get("frameSampleFps")
    if not isinstance(fps, (int, float)) or isinstance(fps, bool) or not 0.5 <= fps <= 10:
        raise ContractError("parameters.frameSampleFps must be in [0.5, 10]")
    tier = params.get("captureTier")
    if tier is not None and tier not in TIERS:
        raise ContractError("parameters.captureTier invalid")
    return JobRequest(
        job_id=_uuid(data.get("jobId"), "jobId"),
        attempt=_int(data.get("attempt"), "attempt", 1, 10),
        organization_id=_uuid(data.get("organizationId"), "organizationId"),
        apartment_id=_uuid(data.get("apartmentId"), "apartmentId"),
        provider=provider,
        inputs=tuple(inputs),
        callback_url=_https(data.get("callbackUrl"), "callbackUrl"),
        max_gaussians=_int(params.get("maxGaussians"), "parameters.maxGaussians", 100_000, 10_000_000),
        training_steps=_int(params.get("trainingSteps"), "parameters.trainingSteps", 1_000, 100_000),
        frame_sample_fps=float(fps),
        capture_tier=tier,
    )


# ------------------------------------------------------------------------- worker events


def _event(job: JobRequest, kind: str, **fields: Any) -> dict[str, Any]:
    return {"contractVersion": CONTRACT_VERSION, "jobId": job.job_id, "attempt": job.attempt, "kind": kind, **fields}


def progress_event(job: JobRequest, stage: str, progress: float) -> dict[str, Any]:
    if stage not in JOB_STAGES:
        raise ContractError(f"unknown stage {stage}")
    return _event(job, "progress", stage=stage, progress=round(max(0.0, min(100.0, progress)), 2))


def _files(files: list[dict[str, Any]], with_hash: bool) -> list[dict[str, Any]]:
    if not 1 <= len(files) <= 200:
        raise ContractError("1..200 output files")
    for f in files:
        if not is_safe_output_path(f["path"]):
            raise ContractError(f"unsafe output path {f['path']!r}")
        _int(f["sizeBytes"], "sizeBytes", 1, MAX_PART_BYTES)
        if with_hash and not re.fullmatch(r"[a-f0-9]{64}", f.get("sha256", "")):
            raise ContractError("sha256 required")
    return files


def upload_urls_event(job: JobRequest, files: list[dict[str, Any]]) -> dict[str, Any]:
    return _event(job, "upload_urls", files=[{"path": f["path"], "sizeBytes": f["sizeBytes"]} for f in _files(files, False)])


def succeeded_event(job: JobRequest, files: list[dict[str, Any]], report: dict[str, Any]) -> dict[str, Any]:
    return _event(job, "succeeded", files=_files(files, True), report=report)


def failed_event(job: JobRequest, code: str, message: str, transient: bool) -> dict[str, Any]:
    if not _CODE.match(code):
        code = "INTERNAL_ERROR"
    return _event(job, "failed", code=code, message=message[:500], transient=bool(transient))
