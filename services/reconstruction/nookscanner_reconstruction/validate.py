"""Stage 5.2: server-side validation of uploaded walkthrough videos (worker "validate" job).

Pure assessment (`assess`) of ffprobe output against data-driven gates, plus thin I/O helpers:
`probe` (runs ffprobe), `concat_parts` (reassembles ADR-016 parts, checking sizes and hash) and
`validate_file`. Every issue carries a stable code, a manager-readable message and specific
re-capture guidance (docs/3D_QUALITY_BAR.md sections 1b and 3). Gates are data, never tied to one
device model; Stage 5.3 selects them per device tier.

CLI: python -m nookscanner_reconstruction.validate [--tier T1..T5] <video> ...  (prints JSON)
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from dataclasses import asdict, dataclass, field
from fractions import Fraction
from pathlib import Path
from typing import Any, Iterable

BLOCK = "block"
WARN = "warn"
INFO = "info"


@dataclass(frozen=True)
class Gates:
    """Thresholds for one capture profile. Initial values; calibrate on real footage (KI-014)."""

    min_short_side_block: int = 720
    min_short_side_recommended: int = 1080
    min_fps_block: float = 20.0
    min_fps_recommended: float = 24.0
    min_duration_s: float = 20.0
    max_duration_s: float = 30 * 60.0
    # Bits per pixel per frame below which detail is likely lost to compression.
    min_bpp: dict[str, float] = field(
        default_factory=lambda: {"h264": 0.04, "hevc": 0.02, "av1": 0.015, "vp9": 0.02}
    )
    vfr_tolerance: float = 0.02
    preferred_codecs: tuple[str, ...] = ("h264", "hevc")
    # Decodable by the frame extractor, accepted with a note.
    accepted_codecs: tuple[str, ...] = ("av1", "vp9", "prores", "mpeg4", "mjpeg")
    containers: tuple[str, ...] = ("mov", "mp4", "m4a", "3gp", "3g2", "mj2")


DEFAULT_GATES = Gates()

# Device tiers are shared with packages/shared (capture profiles). The container image copies the
# file next to the package; locally it is read from the repository (override: env variable).
_TIERS_FILE = Path(
    os.environ.get(
        "NOOKSCANNER_DEVICE_TIERS",
        Path(__file__).resolve().parents[3] / "packages" / "shared" / "src" / "device-tiers.json",
    )
)


def load_device_tiers(path: Path = _TIERS_FILE) -> dict[str, Any]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("version") != 1 or len(data.get("tiers", [])) != 5:
        raise ValueError("unsupported device tier table")
    return data


def gates_for_tier(tier_id: str | None, table: dict[str, Any] | None = None) -> Gates:
    """Validation gates for a capture tier; unknown or missing tiers use T5 (uploaded video).

    Hard minimums are the same for everyone; the "recommended" resolution follows what the tier
    can record, so a phone that can do 4K is told when it uploaded 1080p.
    """
    data = table or load_device_tiers()
    tiers = {t["id"]: t for t in data["tiers"]}
    tier = tiers.get(tier_id or "") or tiers["T5"]
    hard = data["hardMinimum"]
    return Gates(
        min_short_side_block=int(hard["shortSide"]),
        min_fps_block=float(hard["fps"]),
        min_short_side_recommended=int(tier["recommendedShortSide"]),
    )


@dataclass
class Issue:
    code: str
    severity: str
    message: str
    guidance: str = ""


@dataclass
class Report:
    ok: bool
    facts: dict[str, Any]
    issues: list[Issue]

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, "facts": self.facts, "issues": [asdict(i) for i in self.issues]}


def _rate(value: Any) -> float | None:
    try:
        r = Fraction(str(value))
    except (ValueError, ZeroDivisionError):
        return None
    return float(r) if r > 0 else None


def _num(value: Any) -> float | None:
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if n == n and n >= 0 else None  # rejects NaN


def _rotation(stream: dict[str, Any]) -> int:
    for side in stream.get("side_data_list") or []:
        if "rotation" in side:
            try:
                return int(round(float(side["rotation"]))) % 360
            except (TypeError, ValueError):
                pass
    try:
        return int(stream.get("tags", {}).get("rotate", 0)) % 360
    except (TypeError, ValueError):
        return 0


def _dolby_vision(stream: dict[str, Any]) -> bool:
    if any("DOVI" in str(s.get("side_data_type", "")) for s in stream.get("side_data_list") or []):
        return True
    return str(stream.get("codec_tag_string", "")).lower() in ("dvh1", "dvhe")


def assess(probe_json: dict[str, Any], gates: Gates = DEFAULT_GATES) -> Report:
    """Checks one probed video. Never raises on odd input; reports it instead."""
    issues: list[Issue] = []
    fmt = probe_json.get("format") or {}
    streams = probe_json.get("streams") or []
    videos = [
        s
        for s in streams
        if s.get("codec_type") == "video" and not (s.get("disposition") or {}).get("attached_pic")
    ]
    format_names = set(str(fmt.get("format_name", "")).split(","))
    facts: dict[str, Any] = {"container": fmt.get("format_name"), "video_streams": len(videos)}

    if not format_names & set(gates.containers):
        issues.append(
            Issue(
                "CONTAINER_UNSUPPORTED",
                BLOCK,
                "This file is not an MP4 or MOV video.",
                "Export or share the original video from the phone's camera app as MP4 or MOV.",
            )
        )
    if not videos:
        issues.append(
            Issue(
                "NO_VIDEO_STREAM",
                BLOCK,
                "The file contains no video.",
                "Choose the walkthrough video itself, not an audio file or a photo.",
            )
        )
        return Report(False, facts, issues)

    v = max(videos, key=lambda s: (s.get("width") or 0) * (s.get("height") or 0))
    codec = str(v.get("codec_name", "")).lower()
    width, height = int(v.get("width") or 0), int(v.get("height") or 0)
    rotation = _rotation(v)
    disp_w, disp_h = (height, width) if rotation in (90, 270) else (width, height)
    short_side = min(disp_w, disp_h)
    duration = _num(fmt.get("duration")) or _num(v.get("duration")) or 0.0
    avg_fps = _rate(v.get("avg_frame_rate"))
    nominal_fps = _rate(v.get("r_frame_rate"))
    fps = avg_fps or nominal_fps or 0.0
    bitrate = _num(v.get("bit_rate")) or _num(fmt.get("bit_rate")) or 0.0
    bpp = bitrate / (width * height * fps) if width and height and fps else None
    transfer = str(v.get("color_transfer") or "")
    hdr = transfer in ("smpte2084", "arib-std-b67")
    dovi = _dolby_vision(v)
    vfr = bool(
        avg_fps and nominal_fps and abs(avg_fps - nominal_fps) / nominal_fps > gates.vfr_tolerance
    )

    facts.update(
        {
            "codec": codec,
            "profile": v.get("profile"),
            "pix_fmt": v.get("pix_fmt"),
            "width": disp_w,
            "height": disp_h,
            "rotation": rotation,
            "orientation": "portrait" if disp_h > disp_w else "landscape",
            "duration_s": round(duration, 2),
            "fps": round(fps, 3),
            "variable_frame_rate": vfr,
            "bitrate_bps": int(bitrate),
            "bits_per_pixel": round(bpp, 4) if bpp is not None else None,
            "hdr": "dolby_vision" if dovi else ("hlg" if transfer == "arib-std-b67" else ("pq" if hdr else None)),
            "size_bytes": int(_num(fmt.get("size")) or 0),
        }
    )

    if codec not in gates.preferred_codecs:
        if codec in gates.accepted_codecs:
            issues.append(
                Issue(
                    "CODEC_UNUSUAL",
                    INFO,
                    f"The video uses {codec.upper()}, which is accepted but less common.",
                )
            )
        else:
            issues.append(
                Issue(
                    "CODEC_UNSUPPORTED",
                    BLOCK,
                    f"The video codec ({codec or 'unknown'}) cannot be processed.",
                    "Record with the phone's camera app in its default format (H.264 or HEVC).",
                )
            )

    if short_side < gates.min_short_side_block:
        issues.append(
            Issue(
                "RESOLUTION_TOO_LOW",
                BLOCK,
                f"The video is {disp_w}x{disp_h}; at least 720p is needed for a usable 3D apartment.",
                "Set the camera to 4K (or at least 1080p) and record again.",
            )
        )
    elif short_side < gates.min_short_side_recommended:
        issues.append(
            Issue(
                "RESOLUTION_LOW",
                WARN,
                f"The video is {disp_w}x{disp_h}; {gates.min_short_side_recommended}p or more gives a"
                " sharper 3D apartment.",
                "Record in 4K if your phone offers it, otherwise in 1080p.",
            )
        )

    if fps < gates.min_fps_block:
        issues.append(
            Issue(
                "FRAME_RATE_TOO_LOW",
                BLOCK,
                f"The video has {fps:.1f} frames per second; at least 24 are needed.",
                "Record at 30 frames per second.",
            )
        )
    elif fps < gates.min_fps_recommended:
        issues.append(
            Issue(
                "FRAME_RATE_LOW",
                WARN,
                f"The video has {fps:.1f} frames per second.",
                "Record at 30 frames per second for smoother coverage.",
            )
        )
    if vfr:
        issues.append(
            Issue(
                "VARIABLE_FRAME_RATE",
                INFO,
                "The video has a variable frame rate (common on phones); frames are resampled.",
            )
        )

    if duration < gates.min_duration_s:
        issues.append(
            Issue(
                "VIDEO_TOO_SHORT",
                BLOCK,
                f"The video is {duration:.0f} seconds long; a walkthrough needs at least 20 seconds.",
                "Walk slowly through every room, including doorways in both directions.",
            )
        )
    elif duration > gates.max_duration_s:
        issues.append(
            Issue(
                "VIDEO_TOO_LONG",
                BLOCK,
                f"The video is {duration / 60:.0f} minutes long; the limit is 30 minutes.",
                "Record a shorter walkthrough, or split it by area and upload each part.",
            )
        )

    threshold = gates.min_bpp.get(codec)
    if bpp is not None and threshold is not None and bpp < threshold:
        issues.append(
            Issue(
                "BITRATE_LOW",
                WARN,
                "The video is strongly compressed; fine details may be lost.",
                "Upload the original file from the phone, not a copy from a messaging app.",
            )
        )

    if dovi or hdr:
        issues.append(
            Issue(
                "HDR_VIDEO",
                INFO,
                "The video is HDR"
                + (" (Dolby Vision)" if dovi else "")
                + "; colours are converted to standard range for processing.",
            )
        )
    if facts["orientation"] == "portrait":
        issues.append(
            Issue(
                "PORTRAIT_VIDEO",
                WARN,
                "The video is in portrait orientation, which sees less of each room.",
                "Hold the phone sideways (landscape) for the next capture.",
            )
        )

    ok = not any(i.severity == BLOCK for i in issues)
    return Report(ok, facts, issues)


# ---------------------------------------------------------------------------- I/O helpers


class ValidationError(RuntimeError):
    """Raised when a file cannot be probed or parts do not match their registration."""


def probe(path: Path, ffprobe: str | None = None) -> dict[str, Any]:
    exe = ffprobe or shutil.which("ffprobe")
    if not exe:
        raise ValidationError("ffprobe not found")
    result = subprocess.run(
        [exe, "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path)],
        capture_output=True,
        text=True,
        timeout=120,
        check=False,
    )
    if result.returncode != 0:
        return {"format": {}, "streams": [], "error": result.stderr.strip()[:500]}
    return json.loads(result.stdout or "{}")


def concat_parts(
    parts: Iterable[tuple[Path, int]], out_path: Path, expected_sha256: str | None = None
) -> str:
    """Joins parts in order. Each part must have exactly its registered size. Returns sha256."""
    digest = hashlib.sha256()
    with out_path.open("wb") as out:
        for path, size in parts:
            actual = path.stat().st_size
            if actual != size:
                raise ValidationError(f"part {path.name} has {actual} bytes, expected {size}")
            with path.open("rb") as f:
                while chunk := f.read(8 * 1024 * 1024):
                    digest.update(chunk)
                    out.write(chunk)
    sha = digest.hexdigest()
    if expected_sha256 and sha != expected_sha256:
        raise ValidationError("reassembled video does not match its checksum")
    return sha


def validate_file(path: Path, gates: Gates = DEFAULT_GATES) -> Report:
    data = probe(path)
    if data.get("error") is not None and not data.get("streams"):
        return Report(
            False,
            {"probe_error": data["error"]},
            [
                Issue(
                    "UNREADABLE_VIDEO",
                    BLOCK,
                    "The file could not be read as a video; it may be damaged or incomplete.",
                    "Upload the original video file again.",
                )
            ],
        )
    report = assess(data, gates)
    report.facts["size_bytes"] = path.stat().st_size
    return report


def main(argv: list[str]) -> int:
    tier = None
    if argv[:1] == ["--tier"] and len(argv) >= 2:
        tier, argv = argv[1], argv[2:]
    gates = gates_for_tier(tier)
    reports = {arg: validate_file(Path(arg), gates).to_dict() for arg in argv}
    print(json.dumps(reports, indent=2))
    return 0 if all(r["ok"] for r in reports.values()) else 1


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main(sys.argv[1:]))
