"""Stage 5.2 validation tests: pure gate logic plus real ffmpeg-made samples per device tier."""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from nookscanner_reconstruction.validate import (
    BLOCK,
    INFO,
    WARN,
    Gates,
    ValidationError,
    assess,
    concat_parts,
    gates_for_tier,
    load_device_tiers,
    validate_file,
)


def probe_json(**video: object) -> dict:
    stream = {
        "codec_type": "video",
        "codec_name": "hevc",
        "width": 3840,
        "height": 2160,
        "avg_frame_rate": "30/1",
        "r_frame_rate": "30/1",
        "bit_rate": "40000000",
    }
    stream.update(video)
    return {
        "format": {"format_name": "mov,mp4,m4a,3gp,3g2,mj2", "duration": "120.0", "size": "1"},
        "streams": [stream, {"codec_type": "audio", "codec_name": "aac"}],
    }


def codes(report) -> dict[str, str]:
    return {i.code: i.severity for i in report.issues}


class AssessTests(unittest.TestCase):
    def test_good_4k_hevc_passes_without_issues(self) -> None:
        r = assess(probe_json())
        self.assertTrue(r.ok)
        self.assertEqual(r.issues, [])
        self.assertEqual(r.facts["orientation"], "landscape")
        self.assertAlmostEqual(r.facts["bits_per_pixel"], 0.1608, places=3)

    def test_every_issue_has_a_message_and_blocking_ones_have_guidance(self) -> None:
        r = assess(probe_json(codec_name="wmv3", width=640, height=360, avg_frame_rate="15/1", r_frame_rate="15/1"))
        self.assertFalse(r.ok)
        for issue in r.issues:
            self.assertTrue(issue.message)
            if issue.severity == BLOCK:
                self.assertTrue(issue.guidance, issue.code)

    def test_rotation_from_display_matrix_swaps_dimensions(self) -> None:
        r = assess(probe_json(width=1920, height=1080, side_data_list=[{"side_data_type": "Display Matrix", "rotation": -90}]))
        self.assertEqual((r.facts["width"], r.facts["height"], r.facts["rotation"]), (1080, 1920, 270))
        self.assertEqual(codes(r), {"PORTRAIT_VIDEO": WARN})
        self.assertTrue(r.ok)

    def test_legacy_rotate_tag(self) -> None:
        r = assess(probe_json(tags={"rotate": "90"}))
        self.assertEqual(r.facts["orientation"], "portrait")

    def test_variable_frame_rate_is_accepted_with_a_note(self) -> None:
        r = assess(probe_json(avg_frame_rate="2397/100", r_frame_rate="30/1"))
        self.assertTrue(r.facts["variable_frame_rate"])
        self.assertEqual(codes(r)["VARIABLE_FRAME_RATE"], INFO)
        self.assertTrue(r.ok)

    def test_dolby_vision_and_hlg_are_recognised(self) -> None:
        dv = assess(probe_json(codec_tag_string="dvh1", color_transfer="arib-std-b67"))
        self.assertEqual(dv.facts["hdr"], "dolby_vision")
        hlg = assess(probe_json(color_transfer="arib-std-b67"))
        self.assertEqual(hlg.facts["hdr"], "hlg")
        self.assertEqual(codes(hlg)["HDR_VIDEO"], INFO)
        self.assertTrue(dv.ok and hlg.ok)

    def test_resolution_and_frame_rate_gates(self) -> None:
        self.assertEqual(codes(assess(probe_json(width=1280, height=720)))["RESOLUTION_LOW"], WARN)
        self.assertEqual(codes(assess(probe_json(width=960, height=540)))["RESOLUTION_TOO_LOW"], BLOCK)
        self.assertEqual(
            codes(assess(probe_json(avg_frame_rate="15/1", r_frame_rate="15/1")))["FRAME_RATE_TOO_LOW"],
            BLOCK,
        )
        self.assertEqual(
            codes(assess(probe_json(avg_frame_rate="22/1", r_frame_rate="22/1")))["FRAME_RATE_LOW"], WARN
        )

    def test_duration_gates(self) -> None:
        short = probe_json()
        short["format"]["duration"] = "12.5"
        self.assertEqual(codes(assess(short))["VIDEO_TOO_SHORT"], BLOCK)
        long = probe_json()
        long["format"]["duration"] = str(31 * 60)
        self.assertEqual(codes(assess(long))["VIDEO_TOO_LONG"], BLOCK)

    def test_low_bitrate_warns_per_codec(self) -> None:
        self.assertIn("BITRATE_LOW", codes(assess(probe_json(codec_name="h264", width=1920, height=1080, bit_rate="2000000"))))
        self.assertNotIn("BITRATE_LOW", codes(assess(probe_json(codec_name="hevc", width=1920, height=1080, bit_rate="2000000"))))

    def test_codecs(self) -> None:
        self.assertEqual(codes(assess(probe_json(codec_name="av1")))["CODEC_UNUSUAL"], INFO)
        self.assertEqual(codes(assess(probe_json(codec_name="theora")))["CODEC_UNSUPPORTED"], BLOCK)

    def test_no_video_stream_and_wrong_container(self) -> None:
        r = assess({"format": {"format_name": "wav", "duration": "60"}, "streams": [{"codec_type": "audio"}]})
        self.assertEqual(codes(r), {"CONTAINER_UNSUPPORTED": BLOCK, "NO_VIDEO_STREAM": BLOCK})
        # Cover art is not a video.
        art = assess({"format": {"format_name": "mov,mp4"}, "streams": [{"codec_type": "video", "disposition": {"attached_pic": 1}}]})
        self.assertIn("NO_VIDEO_STREAM", codes(art))

    def test_garbage_values_do_not_crash(self) -> None:
        r = assess(probe_json(avg_frame_rate="0/0", r_frame_rate="abc", bit_rate="NaN", width=None, height=None))
        self.assertFalse(r.ok)

    def test_gates_are_data(self) -> None:
        strict = Gates(min_short_side_recommended=2160)
        self.assertIn("RESOLUTION_LOW", codes(assess(probe_json(width=1920, height=1080), strict)))


class TierGateTests(unittest.TestCase):
    def test_gates_come_from_the_shared_tier_table(self) -> None:
        table = load_device_tiers()
        self.assertEqual([t["id"] for t in table["tiers"]], ["T1", "T2", "T3", "T4", "T5"])
        hard = table["hardMinimum"]
        for tier in ("T1", "T2", "T3", "T4", "T5", None, "T9"):
            g = gates_for_tier(tier, table)
            self.assertEqual((g.min_short_side_block, g.min_fps_block), (hard["shortSide"], hard["fps"]))
        self.assertEqual(gates_for_tier("T1", table).min_short_side_recommended, 2160)
        self.assertEqual(gates_for_tier(None, table).min_short_side_recommended, 1080)
        self.assertEqual(gates_for_tier("T9", table), gates_for_tier("T5", table))

    def test_a_4k_phone_uploading_1080p_is_told_it_can_do_better(self) -> None:
        fhd = probe_json(codec_name="h264", width=1920, height=1080, bit_rate="20000000")
        self.assertIn("RESOLUTION_LOW", codes(assess(fhd, gates_for_tier("T1"))))
        self.assertNotIn("RESOLUTION_LOW", codes(assess(fhd, gates_for_tier("T3"))))
        self.assertNotIn("RESOLUTION_LOW", codes(assess(fhd, gates_for_tier(None))))


class ConcatTests(unittest.TestCase):
    def test_parts_are_joined_in_order_with_size_and_hash_checks(self) -> None:
        with tempfile.TemporaryDirectory() as d:
            p1, p2, out = Path(d, "1"), Path(d, "2"), Path(d, "out.mp4")
            p1.write_bytes(b"a" * 10)
            p2.write_bytes(b"b" * 3)
            sha = hashlib.sha256(b"a" * 10 + b"b" * 3).hexdigest()
            self.assertEqual(concat_parts([(p1, 10), (p2, 3)], out, sha), sha)
            self.assertEqual(out.read_bytes(), b"a" * 10 + b"b" * 3)
            with self.assertRaises(ValidationError):
                concat_parts([(p1, 10), (p2, 4)], out)
            with self.assertRaises(ValidationError):
                concat_parts([(p2, 3), (p1, 10)], out, sha)


FFMPEG = shutil.which("ffmpeg")
LAVFI = ["-f", "lavfi", "-i"]


def make(path: Path, *args: str) -> Path:
    if not FFMPEG:  # CI installs ffmpeg; these are real-file tests, never skipped silently.
        raise AssertionError("ffmpeg is required for the sample-video tests")
    subprocess.run([FFMPEG, "-y", "-v", "error", *args, str(path)], check=True, timeout=300)
    return path


class TierSampleTests(unittest.TestCase):
    """Real files emulating the formats of each device tier (synthetic content; real footage
    from several phones is still required for calibration, Blocked on user 4)."""

    tmp: tempfile.TemporaryDirectory[str]

    @classmethod
    def setUpClass(cls) -> None:
        cls.tmp = tempfile.TemporaryDirectory()
        d = Path(cls.tmp.name)
        src = lambda size, rate, secs: f"testsrc2=size={size}:rate={rate}:duration={secs}"
        # T1 recent iPhone Pro: 4K HEVC 10-bit HDR (PQ), MOV. Short clip (encode time); duration
        # is checked by the other samples.
        cls.t1 = make(d / "t1.mov", *LAVFI, src("3840x2160", 30, 2), "-c:v", "libx265", "-preset", "ultrafast",
                      "-pix_fmt", "yuv420p10le", "-color_trc", "smpte2084", "-color_primaries", "bt2020",
                      "-colorspace", "bt2020nc", "-tag:v", "hvc1",
                      "-x265-params", "log-level=error:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc")
        # T2 older/standard iPhone: 1080p H.264 held upright. Phones store landscape pixels plus
        # a rotation matrix, so encode landscape, then add only the matrix (stream copy).
        base = make(d / "t2-base.mov", *LAVFI, src("1920x1080", 30, 21), "-c:v", "libx264", "-preset", "ultrafast",
                    "-b:v", "8M")
        cls.t2 = make(d / "t2.mov", "-display_rotation", "90", "-i", str(base), "-c", "copy")
        # T3 high-end Android: 4K HEVC with variable frame rate (dropped frames), MP4.
        cls.t3 = make(d / "t3.mp4", *LAVFI, src("3840x2160", 30, 2), "-vf", "select='not(eq(mod(n\\,5)\\,0))'",
                      "-fps_mode", "vfr", "-c:v", "libx265", "-preset", "ultrafast", "-x265-params", "log-level=error")
        # T4 mid-range Android / messaging copy: 720p H.264 at a low bitrate, 21 s.
        cls.t4 = make(d / "t4.mp4", *LAVFI, src("1280x720", 30, 21), "-c:v", "libx264", "-preset", "ultrafast",
                      "-b:v", "500k")
        # T5 existing video from another camera: 1080p 25 fps MPEG-4 Part 2, 21 s.
        cls.t5 = make(d / "t5.mp4", *LAVFI, src("1920x1080", 25, 21), "-c:v", "mpeg4", "-q:v", "4")
        cls.short = make(d / "short.mp4", *LAVFI, src("1920x1080", 30, 5), "-c:v", "libx264", "-preset", "ultrafast")
        cls.audio = make(d / "audio.mp4", *LAVFI, "sine=duration=25", "-c:a", "aac")
        cls.garbage = d / "garbage.mp4"
        cls.garbage.write_bytes(b"\x00\x01not a video" * 1000)

    @classmethod
    def tearDownClass(cls) -> None:
        cls.tmp.cleanup()

    def test_t1_iphone_pro_4k_hevc_hdr(self) -> None:
        r = validate_file(self.t1)
        self.assertEqual((r.facts["codec"], r.facts["width"], r.facts["height"], r.facts["hdr"]), ("hevc", 3840, 2160, "pq"))
        self.assertEqual(codes(r), {"HDR_VIDEO": INFO, "VIDEO_TOO_SHORT": BLOCK})

    def test_t2_older_iphone_portrait_h264(self) -> None:
        r = validate_file(self.t2)
        self.assertTrue(r.ok, r.to_dict())
        self.assertIn(r.facts["rotation"], (90, 270))
        self.assertEqual((r.facts["width"], r.facts["height"], r.facts["orientation"]), (1080, 1920, "portrait"))
        self.assertEqual(codes(r), {"PORTRAIT_VIDEO": WARN})

    def test_t3_android_vfr(self) -> None:
        r = validate_file(self.t3)
        self.assertTrue(r.facts["variable_frame_rate"], r.to_dict())
        self.assertEqual(codes(r).get("VARIABLE_FRAME_RATE"), INFO)

    def test_t4_low_resolution_and_bitrate_warn_but_pass(self) -> None:
        r = validate_file(self.t4)
        self.assertTrue(r.ok, r.to_dict())
        self.assertEqual(codes(r), {"RESOLUTION_LOW": WARN, "BITRATE_LOW": WARN})

    def test_t5_other_camera_mpeg4_accepted_with_note(self) -> None:
        r = validate_file(self.t5)
        self.assertTrue(r.ok, r.to_dict())
        self.assertEqual(r.facts["fps"], 25.0)
        self.assertEqual(codes(r), {"CODEC_UNUSUAL": INFO})

    def test_rejections_are_specific(self) -> None:
        self.assertEqual(codes(validate_file(self.short)), {"VIDEO_TOO_SHORT": BLOCK})
        self.assertIn("NO_VIDEO_STREAM", codes(validate_file(self.audio)))
        self.assertEqual(codes(validate_file(self.garbage)), {"UNREADABLE_VIDEO": BLOCK})

    def test_reassembled_parts_validate_like_the_original(self) -> None:
        data = self.t2.read_bytes()
        d = Path(self.tmp.name)
        cut = len(data) // 3
        parts = []
        for i, chunk in enumerate((data[:cut], data[cut : 2 * cut], data[2 * cut :]), start=1):
            p = d / f"part-{i:05d}.mov"
            p.write_bytes(chunk)
            parts.append((p, len(chunk)))
        out = d / "joined.mov"
        concat_parts(parts, out, hashlib.sha256(data).hexdigest())
        self.assertEqual(validate_file(out).to_dict(), {**validate_file(self.t2).to_dict(), "facts": {**validate_file(self.t2).facts}})


if __name__ == "__main__":
    unittest.main()
