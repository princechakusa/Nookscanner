"""Stage 6.1/6.7, step "compressing": trained PLY -> SOG (first load) + streamed LOD SOG.

Runs the SplatTransform commands from `commands.splat_transform_commands` and reports sizes
against the viewer budget (docs/DEVELOPMENT_ROADMAP.md 6.7: first LOD <= 10 MB, total <= 60 MB
for the pilot apartment; initial budget, calibrated in Phase 7 on real devices).
"""

from __future__ import annotations

import shutil
import struct
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable

from .commands import PipelineSettings, splat_transform_commands

Runner = Callable[[list[str]], None]

FIRST_LOD_BUDGET = 10 * 1024 * 1024
TOTAL_BUDGET = 60 * 1024 * 1024


def default_runner(cmd: list[str]) -> None:
    exe = shutil.which(cmd[0])
    if not exe:
        raise RuntimeError(f"{cmd[0]} not found")
    subprocess.run([exe, *cmd[1:]], check=True, timeout=3600)


@dataclass
class PackageReport:
    sog_bytes: int
    stream_bytes: int
    stream_files: int
    within_first_lod_budget: bool
    within_total_budget: bool

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def package_scene(
    ply: Path, outdir: Path, s: PipelineSettings = PipelineSettings(), run: Runner = default_runner
) -> PackageReport:
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "stream").mkdir(exist_ok=True)
    for cmd in splat_transform_commands(ply, outdir, s):
        run(cmd)
    for pct in s.lod_fractions:  # intermediate decimated PLYs are not published
        tmp = outdir / f"lod_{pct}.ply"
        if tmp.exists():
            tmp.unlink()
    sog = (outdir / "scene.sog").stat().st_size
    stream_files = [p for p in (outdir / "stream").rglob("*") if p.is_file()]
    stream = sum(p.stat().st_size for p in stream_files)
    return PackageReport(
        sog_bytes=sog,
        stream_bytes=stream,
        stream_files=len(stream_files),
        within_first_lod_budget=sog <= FIRST_LOD_BUDGET,
        within_total_budget=stream <= TOTAL_BUDGET,
    )


def write_test_ply(path: Path, count: int = 4096, seed: int = 7) -> None:
    """A small, valid 3D Gaussian Splatting PLY (positions on a room-like box, degree-0 colour)
    for pipeline tests. Deterministic; no third-party libraries."""
    props = ["x", "y", "z", "f_dc_0", "f_dc_1", "f_dc_2", "opacity",
             "scale_0", "scale_1", "scale_2", "rot_0", "rot_1", "rot_2", "rot_3"]
    header = (
        "ply\nformat binary_little_endian 1.0\n"
        f"element vertex {count}\n"
        + "".join(f"property float {p}\n" for p in props)
        + "end_header\n"
    ).encode("ascii")
    state = seed
    def rnd() -> float:
        nonlocal state
        state = (1103515245 * state + 12345) & 0x7FFFFFFF
        return state / 0x7FFFFFFF
    body = bytearray()
    for i in range(count):
        wall = i % 6
        u, v = rnd() * 4 - 2, rnd() * 2.5
        x, y, z = [(u, v, -2.0), (u, v, 2.0), (-2.0, v, u), (2.0, v, u), (u, 0.0, v - 1.25), (u, 2.5, v - 1.25)][wall]
        body += struct.pack(
            "<14f", x, y, z, rnd() - 0.5, rnd() - 0.5, rnd() - 0.5, 2.0,
            -4.0, -4.0, -4.5, 1.0, 0.0, 0.0, 0.0,
        )
    path.write_bytes(header + bytes(body))
