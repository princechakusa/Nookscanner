"""Stage 6.1 command builders and COLMAP model statistics."""

from __future__ import annotations

import unittest
from pathlib import Path

from nookscanner_reconstruction.commands import (
    PipelineSettings,
    colmap_commands,
    gsplat_command,
    sfm_stats,
    splat_transform_commands,
)

W = Path("/work/job1")


class ColmapTests(unittest.TestCase):
    def test_global_mapper_pipeline(self) -> None:
        cmds = colmap_commands(W)
        self.assertEqual([c[1] for c in cmds], ["feature_extractor", "sequential_matcher", "global_mapper", "model_converter"])
        fe = cmds[0]
        self.assertIn("--FeatureExtraction.use_gpu", fe)
        self.assertEqual(fe[fe.index("--ImageReader.camera_model") + 1], "OPENCV")
        self.assertEqual(fe[fe.index("--ImageReader.single_camera") + 1], "1")
        self.assertNotIn("--SiftExtraction.use_gpu", sum(cmds, []))  # renamed in COLMAP 4
        self.assertEqual(cmds[3][-2:], ["--output_type", "TXT"])

    def test_incremental_and_cpu_and_extra_flags(self) -> None:
        s = PipelineSettings(mapper="incremental", use_gpu=False, sequential_extra=("--X", "1"))
        cmds = colmap_commands(W, s)
        self.assertEqual(cmds[2][1], "mapper")
        self.assertEqual(cmds[0][cmds[0].index("--FeatureExtraction.use_gpu") + 1], "0")
        self.assertEqual(cmds[1][-2:], ["--X", "1"])
        with self.assertRaises(ValueError):
            colmap_commands(W, PipelineSettings(mapper="magic"))


class GsplatTests(unittest.TestCase):
    def test_mcmc_training_with_holdout_and_ply(self) -> None:
        cmd = gsplat_command(W, PipelineSettings(max_steps=7000, test_every=10))
        self.assertEqual(cmd[2], "mcmc")
        self.assertEqual(cmd[cmd.index("--test_every") + 1], "10")
        self.assertEqual(cmd[cmd.index("--ply_steps") + 1], "6999")
        self.assertIn("--save_ply", cmd)
        self.assertEqual(cmd[cmd.index("--result_dir") + 1], str(W / "results"))


class SplatTransformTests(unittest.TestCase):
    def test_sog_plus_streamed_lods(self) -> None:
        cmds = splat_transform_commands(Path("/w/scene.ply"), Path("/w/out"))
        self.assertEqual(cmds[0][-1], str(Path("/w/out/scene.sog")))
        self.assertEqual([c[c.index("-d") + 1] for c in cmds[1:4]], ["50%", "25%", "10%"])
        stream = cmds[-1]
        self.assertTrue(stream[-1].endswith("lod-meta.json"))
        self.assertEqual(stream.count("-l"), 4)
        self.assertEqual(stream[stream.index(str(Path("/w/scene.ply"))) + 2], "0")

    def test_cpu_device_for_machines_without_gpu(self) -> None:
        cpu = splat_transform_commands(Path("/w/scene.ply"), Path("/w/out"), PipelineSettings(splat_gpu="cpu"))
        self.assertTrue(all(c[1:4] == ["-w", "-g", "cpu"] for c in cpu))
        gpu = splat_transform_commands(Path("/w/scene.ply"), Path("/w/out"), PipelineSettings(splat_gpu=None))
        self.assertTrue(all("-g" not in c for c in gpu))


IMAGES_TXT = """# Image list with two lines of data per image:
#   IMAGE_ID, QW, QX, QY, QZ, TX, TY, TZ, CAMERA_ID, NAME
#   POINTS2D[] as (X, Y, POINT3D_ID)
# Number of images: 2, mean observations per image: 2
1 1 0 0 0 0 0 0 1 frame_000001.jpg
10.0 20.0 1 30.0 40.0 2
2 1 0 0 0 1 0 0 1 frame_000002.jpg
11.0 21.0 1 31.0 41.0 -1
"""
POINTS_TXT = """# 3D point list with one line of data per point:
#   POINT3D_ID, X, Y, Z, R, G, B, ERROR, TRACK[] as (IMAGE_ID, POINT2D_IDX)
1 0.1 0.2 0.3 120 110 100 0.5 1 0 2 0
2 0.4 0.5 0.6 90 80 70 1.5 1 1
"""


class SfmStatsTests(unittest.TestCase):
    def test_registered_ratio_and_reprojection_error(self) -> None:
        names = ["frame_000001.jpg", "frame_000002.jpg", "frame_000003.jpg", "frame_000004.jpg"]
        s = sfm_stats(IMAGES_TXT, POINTS_TXT, names)
        self.assertEqual((s.registered_images, s.input_images, s.registered_ratio), (2, 4, 0.5))
        self.assertEqual((s.points, s.mean_reprojection_error), (2, 1.0))
        self.assertEqual(s.unregistered, ("frame_000003.jpg", "frame_000004.jpg"))

    def test_empty_model(self) -> None:
        s = sfm_stats("# none\n", "", ["a.jpg"])
        self.assertEqual((s.registered_ratio, s.mean_reprojection_error), (0.0, None))


if __name__ == "__main__":
    unittest.main()
