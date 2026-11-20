"""Stage 6.1, step "extracting_frames": sharpness-filtered keyframes from a walkthrough video.

ffmpeg samples candidate frames at `candidate_fps`, scales the long side to `max_long_side`
(applying rotation metadata), and measures blur per frame with its `blurdetect` filter (higher =
blurrier). We keep the sharpest candidate in each 1/target_fps window, drop windows whose best
frame is still too blurry, and report gaps in coverage. Every `holdout_every`-th kept frame is held
out from training for the quality report (docs/3D_QUALITY_BAR.md section 4: ~10% held out).
Stdlib only; ffmpeg is the only external tool.
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
from dataclasses import asdict, dataclass, field
from pathlib import Path


@dataclass(frozen=True)
class FrameSettings:
    candidate_fps: float = 6.0
    target_fps: float = 2.0
    max_long_side: int = 1920
    # blurdetect scores of sharp phone footage are ~2-5; >8 is visibly smeared (initial value,
    # calibrate on real footage, KI-014).
    max_blur: float = 8.0
    max_gap_s: float = 2.0
    holdout_every: int = 10
    jpeg_quality: int = 2


@dataclass(frozen=True)
class Candidate:
    index: int
    time_s: float
    blur: float


@dataclass
class FrameReport:
    candidates: int
    kept: int
    rejected_blurry_windows: int
    gaps: list[tuple[float, float]] = field(default_factory=list)
    train: list[str] = field(default_factory=list)
    test: list[str] = field(default_factory=list)
    mean_blur_kept: float | None = None

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


_FRAME = re.compile(r"frame:(\d+)\s+pts:\S+\s+pts_time:([0-9.]+)")
_BLUR = re.compile(r"lavfi\.blur=([0-9.]+)")


def parse_blur_metadata(text: str) -> list[Candidate]:
    """Parses ffmpeg `metadata=print` output of the blurdetect filter."""
    out: list[Candidate] = []
    current: tuple[int, float] | None = None
    for line in text.splitlines():
        m = _FRAME.search(line)
        if m:
            current = (int(m.group(1)), float(m.group(2)))
            continue
        b = _BLUR.search(line)
        if b and current is not None:
            out.append(Candidate(current[0], current[1], float(b.group(1))))
            current = None
    return out


def select_keyframes(
    candidates: list[Candidate], s: FrameSettings
) -> tuple[list[Candidate], int, list[tuple[float, float]]]:
    """Sharpest candidate per window; windows whose best is too blurry are rejected.

    Returns (kept in time order, rejected window count, coverage gaps longer than max_gap_s).
    """
    if not candidates:
        return [], 0, []
    window = 1.0 / s.target_fps
    buckets: dict[int, Candidate] = {}
    for c in candidates:
        key = int(c.time_s // window)
        best = buckets.get(key)
        if best is None or c.blur < best.blur:
            buckets[key] = c
    kept = [c for _, c in sorted(buckets.items()) if c.blur <= s.max_blur]
    rejected = len(buckets) - len(kept)
    gaps: list[tuple[float, float]] = []
    times = [candidates[0].time_s] + [c.time_s for c in kept] + [candidates[-1].time_s]
    for a, b in zip(times, times[1:]):
        if b - a > s.max_gap_s:
            gaps.append((round(a, 2), round(b, 2)))
    return kept, rejected, gaps


def split_holdout(names: list[str], every: int) -> tuple[list[str], list[str]]:
    """Deterministic split matching gsplat's parser (`--test_every`): images whose index in name
    order is a multiple of `every` are held out, so our report and gsplat's metrics agree."""
    if every <= 1:
        return list(names), []
    test = [n for i, n in enumerate(sorted(names)) if i % every == 0]
    held = set(test)
    return [n for n in names if n not in held], test


def _scale_filter(max_long_side: int) -> str:
    m = max_long_side
    return f"scale=w='if(gt(iw,ih),min({m},iw),-2)':h='if(gt(iw,ih),-2,min({m},ih))'"


def extract_keyframes(
    video: Path, workdir: Path, s: FrameSettings = FrameSettings(), ffmpeg: str | None = None
) -> FrameReport:
    """Writes `images/frame_NNNNNN.jpg` (kept frames only) and `splits.json` under workdir."""
    exe = ffmpeg or shutil.which("ffmpeg")
    if not exe:
        raise RuntimeError("ffmpeg not found")
    cand_dir = workdir / "candidates"
    img_dir = workdir / "images"
    for d in (cand_dir, img_dir):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)
    meta = workdir / "blur.txt"
    vf = f"fps={s.candidate_fps},{_scale_filter(s.max_long_side)},blurdetect,metadata=print:file={meta.name}"
    subprocess.run(
        [exe, "-y", "-v", "error", "-i", str(video), "-vf", vf, "-q:v", str(s.jpeg_quality),
         str(cand_dir / "c_%06d.jpg")],
        check=True,
        cwd=workdir,
        timeout=3600,
    )
    candidates = parse_blur_metadata(meta.read_text(encoding="utf-8"))
    kept, rejected, gaps = select_keyframes(candidates, s)
    names: list[str] = []
    for n, c in enumerate(kept, start=1):
        name = f"frame_{n:06d}.jpg"
        # ffmpeg numbers output files from 1 in candidate order (frame index 0 -> c_000001.jpg).
        shutil.move(str(cand_dir / f"c_{c.index + 1:06d}.jpg"), str(img_dir / name))
        names.append(name)
    shutil.rmtree(cand_dir)
    train, test = split_holdout(names, s.holdout_every)
    report = FrameReport(
        candidates=len(candidates),
        kept=len(kept),
        rejected_blurry_windows=rejected,
        gaps=gaps,
        train=train,
        test=test,
        mean_blur_kept=round(sum(c.blur for c in kept) / len(kept), 3) if kept else None,
    )
    (workdir / "splits.json").write_text(
        json.dumps({"train": train, "test": test}, indent=2), encoding="utf-8"
    )
    return report
