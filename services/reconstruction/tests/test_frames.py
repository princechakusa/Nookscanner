"""Stage 6.1 frame extraction: pure selection logic plus a real ffmpeg run on a sample video."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from nookscanner_reconstruction.frames import (
    Candidate,
    FrameSettings,
    extract_keyframes,
    parse_blur_metadata,
    select_keyframes,
    split_holdout,
)

S = FrameSettings(candidate_fps=6, target_fps=2, max_blur=8, max_gap_s=2, holdout_every=10)


class SelectionTests(unittest.TestCase):
    def test_parse_ffmpeg_metadata_print(self) -> None:
        text = (
            "frame:0    pts:0       pts_time:0\nlavfi.blur=3.25\n"
            "frame:1    pts:512     pts_time:0.166667\nlavfi.blur=9.5\n"
        )
        self.assertEqual(
            parse_blur_metadata(text),
            [Candidate(0, 0.0, 3.25), Candidate(1, 0.166667, 9.5)],
        )

    def test_keeps_the_sharpest_frame_per_window(self) -> None:
        cands = [Candidate(i, i / 6, b) for i, b in enumerate([5, 2, 4, 7, 7, 1])]
        kept, rejected, gaps = select_keyframes(cands, S)
        self.assertEqual([c.index for c in kept], [1, 5])
        self.assertEqual((rejected, gaps), (0, []))

    def test_rejects_blurry_windows_and_reports_gaps(self) -> None:
        # 0-1 s sharp, 1-4 s blurred (whip pan), 4-5 s sharp.
        cands = [Candidate(i, i / 6, 12.0 if 6 <= i < 24 else 3.0) for i in range(30)]
        kept, rejected, gaps = select_keyframes(cands, S)
        self.assertEqual(rejected, 6)
        self.assertTrue(all(c.blur <= S.max_blur for c in kept))
        self.assertEqual(len(gaps), 1)
        self.assertGreater(gaps[0][1] - gaps[0][0], 2)

    def test_empty_input(self) -> None:
        self.assertEqual(select_keyframes([], S), ([], 0, []))

    def test_holdout_is_about_ten_percent_and_deterministic(self) -> None:
        names = [f"f{i:03d}" for i in range(100)]
        train, test = split_holdout(names, 10)
        self.assertEqual(len(test), 10)
        self.assertEqual(test[:2], ["f000", "f010"])
        self.assertEqual(set(train) | set(test), set(names))
        self.assertFalse(set(train) & set(test))
        self.assertEqual(split_holdout(names, 1), (names, []))


class ExtractionTests(unittest.TestCase):
    def test_real_video_with_a_blurred_stretch(self) -> None:
        # Real-file test: never skipped; CI installs ffmpeg.
        self.assertIsNotNone(shutil.which("ffmpeg"), "ffmpeg is required")
        with tempfile.TemporaryDirectory() as d:
            work = Path(d)
            video = work / "walk.mp4"
            # 4K portrait-rotated phone-like clip; boxblur between 4 s and 7 s simulates a whip pan.
            base = work / "base.mp4"
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i",
                 "testsrc2=size=1920x1080:rate=30:duration=12",
                 "-vf", "boxblur=enable='between(t,4,7)':luma_radius=12:luma_power=3",
                 "-c:v", "libx264", "-preset", "ultrafast", str(base)],
                check=True, timeout=300,
            )
            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-display_rotation", "90", "-i", str(base),
                 "-c", "copy", str(video)],
                check=True, timeout=120,
            )
            report = extract_keyframes(video, work / "job", FrameSettings(max_long_side=960))
            images = sorted((work / "job" / "images").glob("*.jpg"))
            self.assertEqual(len(images), report.kept)
            self.assertGreaterEqual(report.candidates, 70)
            self.assertGreater(report.rejected_blurry_windows, 0, report.to_dict())
            self.assertTrue(report.gaps, report.to_dict())
            splits = json.loads((work / "job" / "splits.json").read_text())
            self.assertEqual(len(splits["train"]) + len(splits["test"]), report.kept)
            # Rotation applied and long side capped: portrait 540x960.
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                 "stream=width,height", "-of", "csv=p=0", str(images[0])],
                capture_output=True, text=True, check=True,
            ).stdout.strip()
            self.assertEqual(probe, "540,960")
            self.assertFalse((work / "job" / "candidates").exists())


if __name__ == "__main__":
    unittest.main()
