"""Job contract v1, mirrored from packages/shared/src/processing.ts (docs/API_SPECIFICATION.md s6)."""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Any

PROVIDERS = ("self_hosted_gsplat", "varjo_teleport")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")


class ContractError(ValueError):
    """Raised when a job request does not satisfy the contract."""


def _uuid(value: Any, field: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except (ValueError, TypeError) as exc:
        raise ContractError(f"{field} must be a UUID") from exc


def _https(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.startswith("https://"):
        raise ContractError(f"{field} must be an https URL")
    return value


def _int_range(value: Any, field: str, lo: int, hi: int) -> int:
    if not isinstance(value, int) or isinstance(value, bool) or not lo <= value <= hi:
        raise ContractError(f"{field} must be an integer in [{lo}, {hi}]")
    return value


@dataclass(frozen=True)
class JobInput:
    upload_id: str
    download_url: str
    sha256: str
    size_bytes: int


@dataclass(frozen=True)
class JobRequest:
    job_id: str
    attempt: int
    organization_id: str
    apartment_id: str
    provider: str
    inputs: tuple[JobInput, ...]
    upload_urls: dict[str, str]
    callback_url: str
    max_gaussians: int
    training_steps: int
    frame_sample_fps: float


def parse_job_request(data: dict[str, Any]) -> JobRequest:
    if data.get("contractVersion") != 1:
        raise ContractError("unsupported contractVersion")
    provider = data.get("provider")
    if provider not in PROVIDERS:
        raise ContractError("unknown provider")
    raw_inputs = data.get("inputs")
    if not isinstance(raw_inputs, list) or not 1 <= len(raw_inputs) <= 20:
        raise ContractError("inputs must contain 1..20 items")
    inputs = []
    for i, item in enumerate(raw_inputs):
        sha = item.get("sha256")
        if not isinstance(sha, str) or not _SHA256.match(sha):
            raise ContractError(f"inputs[{i}].sha256 invalid")
        inputs.append(
            JobInput(
                upload_id=_uuid(item.get("uploadId"), f"inputs[{i}].uploadId"),
                download_url=_https(item.get("downloadUrl"), f"inputs[{i}].downloadUrl"),
                sha256=sha,
                size_bytes=_int_range(item.get("sizeBytes"), f"inputs[{i}].sizeBytes", 1, 2**50),
            )
        )
    urls = (data.get("outputs") or {}).get("uploadUrls") or {}
    upload_urls = {k: _https(urls.get(k), f"outputs.uploadUrls.{k}") for k in ("ply", "sog", "spz", "preview")}
    params = data.get("parameters") or {}
    fps = params.get("frameSampleFps")
    if not isinstance(fps, (int, float)) or isinstance(fps, bool) or not 0.5 <= fps <= 10:
        raise ContractError("parameters.frameSampleFps must be in [0.5, 10]")
    return JobRequest(
        job_id=_uuid(data.get("jobId"), "jobId"),
        attempt=_int_range(data.get("attempt"), "attempt", 1, 10),
        organization_id=_uuid(data.get("organizationId"), "organizationId"),
        apartment_id=_uuid(data.get("apartmentId"), "apartmentId"),
        provider=provider,
        inputs=tuple(inputs),
        upload_urls=upload_urls,
        callback_url=_https(data.get("callbackUrl"), "callbackUrl"),
        max_gaussians=_int_range(params.get("maxGaussians"), "parameters.maxGaussians", 100_000, 10_000_000),
        training_steps=_int_range(params.get("trainingSteps"), "parameters.trainingSteps", 1_000, 100_000),
        frame_sample_fps=float(fps),
    )
