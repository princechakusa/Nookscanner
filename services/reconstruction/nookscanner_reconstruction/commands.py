"""Stage 6.1: command lines for poses (COLMAP 4.x, GLOMAP global mapper), training (gsplat
simple_trainer, MCMC) and packaging (PlayCanvas SplatTransform). Pure builders, unit-tested; the
GPU container runs them (Modal, Phase 6). Option names checked against the COLMAP CLI docs
(4.3), gsplat `examples/simple_trainer.py` and the splat-transform README on 2026-11-20.
Options not documented there (sequential-matcher loop detection) are settings, verified on the
first GPU run, never assumed.
"""

from __future__ import annotations

import os

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class PipelineSettings:
    # COLMAP
    camera_model: str = "OPENCV"
    use_gpu: bool = True
    mapper: str = "global"  # "global" (GLOMAP, colmap global_mapper) or "incremental"
    sequential_overlap: int = 15
    sequential_extra: tuple[str, ...] = field(default_factory=tuple)  # e.g. loop detection flags
    # gsplat
    trainer: Path = Path("/opt/gsplat/examples/simple_trainer.py")
    strategy: str = "mcmc"
    data_factor: int = 1
    max_steps: int = 30_000
    test_every: int = 10
    # SplatTransform
    lod_fractions: tuple[int, ...] = (50, 25, 10)  # percent of splats kept per lower LOD
    # WebGPU adapter index, or "cpu" on machines without a GPU (CI runners). SOG compression is
    # slower on CPU but gives the same files; the GPU worker leaves it unset (default adapter).
    splat_gpu: str | None = field(default_factory=lambda: os.environ.get("NOOK_SPLAT_GPU") or None)


def colmap_commands(workdir: Path, s: PipelineSettings = PipelineSettings()) -> list[list[str]]:
    """Feature extraction, sequential matching (walkthroughs are ordered video), mapping, and a
    text export of the model for the quality report."""
    db = str(workdir / "database.db")
    images = str(workdir / "images")
    sparse = workdir / "sparse"
    gpu = "1" if s.use_gpu else "0"
    cmds = [
        ["colmap", "feature_extractor", "--database_path", db, "--image_path", images,
         "--ImageReader.single_camera", "1", "--ImageReader.camera_model", s.camera_model,
         "--FeatureExtraction.use_gpu", gpu],
        ["colmap", "sequential_matcher", "--database_path", db,
         "--SequentialMatching.overlap", str(s.sequential_overlap),
         "--FeatureMatching.use_gpu", gpu, *s.sequential_extra],
    ]
    if s.mapper == "global":
        cmds.append(["colmap", "global_mapper", "--database_path", db, "--image_path", images,
                     "--output_path", str(sparse)])
    elif s.mapper == "incremental":
        cmds.append(["colmap", "mapper", "--database_path", db, "--image_path", images,
                     "--output_path", str(sparse)])
    else:
        raise ValueError(f"unknown mapper {s.mapper}")
    cmds.append(["colmap", "model_converter", "--input_path", str(sparse / "0"),
                 "--output_path", str(workdir / "sparse_txt"), "--output_type", "TXT"])
    return cmds


def gsplat_command(workdir: Path, s: PipelineSettings = PipelineSettings()) -> list[str]:
    """MCMC training with every `test_every`-th image held out; writes stats/val_step*.json
    (psnr, ssim, lpips) and ply/point_cloud_<step>.ply under results/."""
    last = s.max_steps - 1
    return [
        "python", str(s.trainer), s.strategy,
        "--data_dir", str(workdir),
        "--result_dir", str(workdir / "results"),
        "--data_factor", str(s.data_factor),
        "--max_steps", str(s.max_steps),
        "--test_every", str(s.test_every),
        "--eval_steps", str(last),
        "--save_steps", str(last),
        "--ply_steps", str(last),
        "--save_ply",
        "--disable_viewer",
        "--disable_video",
    ]


def splat_transform_commands(ply: Path, outdir: Path, s: PipelineSettings = PipelineSettings()) -> list[list[str]]:
    """Single-file SOG for the first load, plus decimated LODs bundled as streamed SOG."""
    tool = ["splat-transform", "-w", *(["-g", s.splat_gpu] if s.splat_gpu else [])]
    cmds = [[*tool, str(ply), str(outdir / "scene.sog")]]
    lods = [str(ply)]
    for pct in s.lod_fractions:
        out = outdir / f"lod_{pct}.ply"
        cmds.append([*tool, str(ply), "-d", f"{pct}%", str(out)])
        lods.append(str(out))
    stream: list[str] = [*tool]
    for level, path in enumerate(lods):
        stream += [path, "-l", str(level)]
    stream.append(str(outdir / "stream" / "lod-meta.json"))
    cmds.append(stream)
    return cmds


# ------------------------------------------------------------------ COLMAP text model statistics


@dataclass(frozen=True)
class SfmStats:
    registered_images: int
    input_images: int
    registered_ratio: float
    points: int
    mean_reprojection_error: float | None
    unregistered: tuple[str, ...]


def sfm_stats(images_txt: str, points3d_txt: str, input_names: list[str]) -> SfmStats:
    """Parses COLMAP `images.txt` (two lines per image: header with NAME last, then 2D points)
    and `points3D.txt` (POINT3D_ID X Y Z R G B ERROR TRACK[]). Comment lines start with '#'."""
    registered: list[str] = []
    lines = [ln for ln in images_txt.splitlines() if ln.strip() and not ln.startswith("#")]
    for header in lines[0::2]:
        parts = header.split()
        if len(parts) >= 10:
            registered.append(parts[9])
    errors: list[float] = []
    for ln in points3d_txt.splitlines():
        if ln.strip() and not ln.startswith("#"):
            parts = ln.split()
            if len(parts) >= 8:
                errors.append(float(parts[7]))
    reg = set(registered)
    return SfmStats(
        registered_images=len(reg),
        input_images=len(input_names),
        registered_ratio=round(len(reg & set(input_names)) / len(input_names), 4) if input_names else 0.0,
        points=len(errors),
        mean_reprojection_error=round(sum(errors) / len(errors), 4) if errors else None,
        unregistered=tuple(n for n in input_names if n not in reg),
    )
