"""Reconstruction provider interface (ADR-004). Implementations arrive in Phase 6.

Stages reported to the platform (packages/shared/src/processing.ts JOB_STAGES):
downloading -> extracting_frames -> estimating_poses -> training -> cleaning -> compressing -> uploading -> done
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Callable

from .contract import JobRequest

ProgressCallback = Callable[[str, float], None]


class ReconstructionProvider(ABC):
    name: str

    @abstractmethod
    def run(self, job: JobRequest, report: ProgressCallback) -> dict[str, object]:
        """Run the job end to end and return quality metrics. Must be idempotent per (job_id, attempt)."""


class SelfHostedGsplatProvider(ReconstructionProvider):
    """ffmpeg -> COLMAP/GLOMAP (BSD) -> gsplat (Apache-2.0) -> SplatTransform. Never the INRIA code."""

    name = "self_hosted_gsplat"

    def run(self, job: JobRequest, report: ProgressCallback) -> dict[str, object]:
        raise NotImplementedError("Implemented in Phase 6 (Modal GPU container)")


class VarjoTeleportProvider(ReconstructionProvider):
    """Managed benchmark provider for the Phase 6 bake-off. Requires user-approved account and API key."""

    name = "varjo_teleport"

    def run(self, job: JobRequest, report: ProgressCallback) -> dict[str, object]:
        raise NotImplementedError("Implemented in Phase 6 after the user creates a Teleport developer account")


def get_provider(name: str) -> ReconstructionProvider:
    providers: dict[str, type[ReconstructionProvider]] = {
        SelfHostedGsplatProvider.name: SelfHostedGsplatProvider,
        VarjoTeleportProvider.name: VarjoTeleportProvider,
    }
    if name not in providers:
        raise KeyError(f"unknown provider {name}")
    return providers[name]()
