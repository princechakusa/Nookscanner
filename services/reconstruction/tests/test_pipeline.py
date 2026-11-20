"""Stage 6.1 orchestration end to end on CPU: real ffprobe validation, real ffmpeg keyframes and real
SplatTransform packaging; COLMAP and gsplat (GPU, Modal) are replaced by stand-ins that write the
files those tools produce, so stage order, resume and the measured report are tested here."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from nookscanner_reconstruction.commands import PipelineSettings
from nookscanner_reconstruction.frames import FrameSettings
from nookscanner_reconstruction.packaging import write_test_ply
from nookscanner_reconstruction.pipeline import PipelineConfig, PipelineError, run_pipeline
from tests.test_packaging import local_runner


class FakeGpu:
    """Stands in for COLMAP and gsplat; delegates splat-transform to the real binary."""

    def __init__(self, workdir: Path, register_ratio: float = 1.0, fail_training_once: bool = False) -> None:
        self.workdir = workdir
        self.register_ratio = register_ratio
        self.fail_training_once = fail_training_once
        self.calls: list[str] = []

    def __call__(self, cmd: list[str]) -> None:
        tool = cmd[1] if cmd[0] == "colmap" else ("gsplat" if cmd[0] == "python" else cmd[0])
        self.calls.append(tool)
        if tool == "model_converter":
            names = sorted(p.name for p in (self.workdir / "images").glob("*.jpg"))
            keep = names[: int(len(names) * self.register_ratio)]
            txt = self.workdir / "sparse_txt"
            txt.mkdir(exist_ok=True)
            (txt / "images.txt").write_text(
                "".join(f"{i + 1} 1 0 0 0 0 0 0 1 {n}\n0 0 -1\n" for i, n in enumerate(keep)), encoding="utf-8"
            )
            (txt / "points3D.txt").write_text("1 0 0 0 1 1 1 0.6 1 0\n2 0 0 1 1 1 1 0.8 1 0\n", encoding="utf-8")
        elif tool == "gsplat":
            if self.fail_training_once:
                self.fail_training_once = False
                raise subprocess.CalledProcessError(1, cmd)
            results = self.workdir / "results"
            (results / "stats").mkdir(parents=True, exist_ok=True)
            (results / "ply").mkdir(parents=True, exist_ok=True)
            (results / "stats" / "val_step29999.json").write_text(
                json.dumps({"psnr": 27.4, "ssim": 0.873, "lpips": 0.142, "num_GS": 4096}), encoding="utf-8"
            )
            write_test_ply(results / "ply" / "point_cloud_29999.ply", count=4096)
        elif tool == "splat-transform":
            local_runner(cmd)


class PipelineTests(unittest.TestCase):
    video: Path
    tmp: tempfile.TemporaryDirectory[str]

    @classmethod
    def setUpClass(cls) -> None:
        assert shutil.which("ffmpeg"), "ffmpeg is required"
        cls.tmp = tempfile.TemporaryDirectory()
        cls.video = Path(cls.tmp.name) / "walk.mp4"
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=22",
             "-c:v", "libx264", "-preset", "ultrafast", "-b:v", "6M", str(cls.video)],
            check=True, timeout=300,
        )

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def config(self) -> PipelineConfig:
        return PipelineConfig(
            frames=FrameSettings(max_long_side=640),
            settings=PipelineSettings(lod_fractions=(50,)),
        )

    def test_end_to_end_report_and_resume_after_a_failure(self) -> None:
        work = Path(self.tmp.name) / "job-a"
        gpu = FakeGpu(work, fail_training_once=True)
        stages: list[str] = []
        with self.assertRaises(subprocess.CalledProcessError):
            run_pipeline(self.video, work, self.config(), gpu, lambda s, f: stages.append(s))
        self.assertEqual(stages[-1], "training")
        first_calls = list(gpu.calls)

        # Retry with the same workdir: finished stages are skipped (no second COLMAP run).
        report = run_pipeline(self.video, work, self.config(), gpu, lambda s, f: stages.append(s))
        retry_calls = gpu.calls[len(first_calls):]
        self.assertNotIn("feature_extractor", retry_calls)
        self.assertEqual(retry_calls[0], "gsplat")
        self.assertEqual(stages[-1], "done")

        self.assertTrue(report["validation"]["ok"])
        self.assertGreaterEqual(report["frames"]["kept"], 40)
        self.assertEqual(report["sfm"]["registered_ratio"], 1.0)
        self.assertEqual(report["sfm"]["mean_reprojection_error_px"], 0.7)
        self.assertEqual(report["heldout"]["psnr"], 27.4)
        self.assertEqual(report["heldout"]["frames"], len(report["frames"]["test"]))
        self.assertTrue((work / "package" / "scene.sog").exists())
        self.assertTrue((work / "package" / "stream" / "lod-meta.json").exists())
        self.assertEqual(report["flags"], [])
        self.assertEqual(json.loads((work / "report.json").read_text())["heldout"]["ssim"], 0.873)

    def test_low_camera_registration_is_flagged(self) -> None:
        work = Path(self.tmp.name) / "job-b"
        report = run_pipeline(self.video, work, self.config(), FakeGpu(work, register_ratio=0.5))
        self.assertIn("LOW_CAMERA_REGISTRATION", report["flags"])
        self.assertAlmostEqual(report["sfm"]["registered_ratio"], 0.5, delta=0.03)

    def test_invalid_video_stops_before_any_gpu_work(self) -> None:
        work = Path(self.tmp.name) / "job-c"
        short = Path(self.tmp.name) / "short.mp4"
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=4",
             "-c:v", "libx264", "-preset", "ultrafast", str(short)],
            check=True, timeout=120,
        )
        gpu = FakeGpu(work)
        with self.assertRaises(PipelineError) as ctx:
            run_pipeline(short, work, self.config(), gpu)
        self.assertEqual(ctx.exception.code, "VIDEO_TOO_SHORT")
        self.assertEqual(gpu.calls, [])


if __name__ == "__main__":
    unittest.main()
