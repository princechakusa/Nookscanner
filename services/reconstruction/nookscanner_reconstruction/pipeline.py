"""Stage 6.1 orchestration: video -> keyframes -> poses -> training -> packaging -> report.

Each stage writes `<workdir>/.done/<stage>` when it succeeds, so a retried job (same workdir)
resumes after the last finished stage (idempotent per job, providers.py contract). Every external
tool goes through an injectable runner, so the order, resume logic and report assembly are tested
without a GPU; the Modal container uses the real runner.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable

from .commands import PipelineSettings, colmap_commands, gsplat_command, sfm_stats
from .frames import FrameSettings, extract_keyframes
from .packaging import Runner, default_runner, package_scene
from .validate import Gates, validate_file

ProgressCallback = Callable[[str, float], None]

STAGES = ("validating", "extracting_frames", "estimating_poses", "training", "compressing", "reporting")


class PipelineError(RuntimeError):
    """A stage failed for a reason the manager can act on (code + message)."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass
class PipelineConfig:
    frames: FrameSettings = FrameSettings()
    settings: PipelineSettings = PipelineSettings()
    gates: Gates = Gates()
    # Below this share of registered cameras the poses are not trustworthy (quality bar s3/s4;
    # initial value, calibrate on real footage).
    min_registered_ratio: float = 0.8


def _done(workdir: Path, stage: str) -> bool:
    return (workdir / ".done" / stage).exists()


def _mark(workdir: Path, stage: str) -> None:
    (workdir / ".done").mkdir(exist_ok=True)
    (workdir / ".done" / stage).write_text("ok", encoding="utf-8")


def _latest_stats(results: Path) -> dict[str, Any]:
    files = sorted((results / "stats").glob("val_step*.json"))
    if not files:
        raise PipelineError("TRAINING_NO_METRICS", "Training produced no evaluation metrics.")
    return json.loads(files[-1].read_text(encoding="utf-8"))


def _latest_ply(results: Path) -> Path:
    plys = sorted((results / "ply").glob("point_cloud_*.ply"), key=lambda p: int(p.stem.split("_")[-1]))
    if not plys:
        raise PipelineError("TRAINING_NO_OUTPUT", "Training produced no 3D scene file.")
    return plys[-1]


def run_pipeline(
    video: Path,
    workdir: Path,
    config: PipelineConfig = PipelineConfig(),
    run: Runner = default_runner,
    report: ProgressCallback = lambda stage, fraction: None,
) -> dict[str, Any]:
    workdir.mkdir(parents=True, exist_ok=True)
    total = len(STAGES)

    def step(i: int, stage: str) -> bool:
        report(stage, i / total)
        return not _done(workdir, stage)

    if step(0, "validating"):
        v = validate_file(video, config.gates)
        (workdir / "validation.json").write_text(json.dumps(v.to_dict(), indent=2), encoding="utf-8")
        if not v.ok:
            blocking = [i for i in v.issues if i.severity == "block"]
            raise PipelineError(blocking[0].code, blocking[0].message)
        _mark(workdir, "validating")

    if step(1, "extracting_frames"):
        fr = extract_keyframes(video, workdir, config.frames)
        (workdir / "frames.json").write_text(json.dumps(fr.to_dict(), indent=2), encoding="utf-8")
        if fr.kept < 20:
            raise PipelineError("TOO_FEW_SHARP_FRAMES", "Too few sharp frames: walk more slowly and keep the phone steady.")
        _mark(workdir, "extracting_frames")

    if step(2, "estimating_poses"):
        for cmd in colmap_commands(workdir, config.settings):
            run(cmd)
        _mark(workdir, "estimating_poses")

    if step(3, "training"):
        run(gsplat_command(workdir, config.settings))
        _mark(workdir, "training")

    results = workdir / "results"
    if step(4, "compressing"):
        pkg = package_scene(_latest_ply(results), workdir / "package", config.settings, run)
        (workdir / "package.json").write_text(json.dumps(pkg.to_dict(), indent=2), encoding="utf-8")
        _mark(workdir, "compressing")

    report("reporting", 5 / total)
    splits = json.loads((workdir / "splits.json").read_text(encoding="utf-8"))
    names = sorted(splits["train"] + splits["test"])
    txt = workdir / "sparse_txt"
    sfm = sfm_stats(
        (txt / "images.txt").read_text(encoding="utf-8"),
        (txt / "points3D.txt").read_text(encoding="utf-8"),
        names,
    )
    metrics = _latest_stats(results)
    scene_report: dict[str, Any] = {
        "validation": json.loads((workdir / "validation.json").read_text(encoding="utf-8")),
        "frames": json.loads((workdir / "frames.json").read_text(encoding="utf-8")),
        "sfm": {
            "registered_ratio": sfm.registered_ratio,
            "registered_images": sfm.registered_images,
            "input_images": sfm.input_images,
            "mean_reprojection_error_px": sfm.mean_reprojection_error,
            "points": sfm.points,
            "unregistered": list(sfm.unregistered)[:50],
        },
        "heldout": {
            "frames": len(splits["test"]),
            "psnr": metrics.get("psnr"),
            "ssim": metrics.get("ssim"),
            "lpips": metrics.get("lpips"),
            "gaussians": metrics.get("num_GS"),
        },
        "package": json.loads((workdir / "package.json").read_text(encoding="utf-8")),
        "flags": [],
    }
    if sfm.registered_ratio < config.min_registered_ratio:
        scene_report["flags"].append("LOW_CAMERA_REGISTRATION")
    if not scene_report["package"]["within_first_lod_budget"]:
        scene_report["flags"].append("FIRST_LOAD_OVER_BUDGET")
    (workdir / "report.json").write_text(json.dumps(scene_report, indent=2), encoding="utf-8")
    _mark(workdir, "reporting")
    report("done", 1.0)
    return scene_report
