"""Stage 6.1/6.7 packaging: real SplatTransform run on a synthetic splat PLY."""

from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from nookscanner_reconstruction.commands import PipelineSettings
from nookscanner_reconstruction.packaging import package_scene, write_test_ply

REPO = Path(__file__).resolve().parents[3]
BIN = REPO / "node_modules" / ".bin" / ("splat-transform.cmd" if os.name == "nt" else "splat-transform")


def local_runner(cmd: list[str]) -> None:
    # The repository pins @playcanvas/splat-transform as a dev dependency (npm ci installs it).
    subprocess.run([str(BIN), *cmd[1:]], check=True, timeout=600)


class PackagingTests(unittest.TestCase):
    def test_ply_to_sog_and_streamed_lods(self) -> None:
        self.assertTrue(BIN.exists(), f"{BIN} missing: run npm ci")
        with tempfile.TemporaryDirectory() as d:
            work = Path(d)
            ply = work / "scene.ply"
            write_test_ply(ply, count=4096)
            report = package_scene(ply, work / "out", PipelineSettings(lod_fractions=(50, 25)), local_runner)
            self.assertGreater(report.sog_bytes, 0)
            self.assertLess(report.sog_bytes, ply.stat().st_size)  # compressed
            self.assertTrue((work / "out" / "stream" / "lod-meta.json").exists())
            self.assertGreater(report.stream_files, 1)
            self.assertTrue(report.within_first_lod_budget and report.within_total_budget)
            self.assertFalse(list((work / "out").glob("lod_*.ply")))
            # The SOG reads back with the same number of splats.
            info = subprocess.run(
                [str(BIN), str(work / "out" / "scene.sog"), "--info", "json", "null"],
                capture_output=True, text=True, timeout=300,
            )
            self.assertEqual(info.returncode, 0, info.stderr)
            self.assertIn("4096", info.stdout)


if __name__ == "__main__":
    unittest.main()
