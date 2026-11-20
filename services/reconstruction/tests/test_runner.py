"""Stage 6.2: runner (download, join, provider, upload, callbacks) with fake and real HTTP transports."""

from __future__ import annotations

import copy
import hashlib
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from nookscanner_reconstruction.contract import parse_job_request
from nookscanner_reconstruction.pipeline import PipelineError
from nookscanner_reconstruction.runner import (
    SIGNATURE_HEADER,
    TIMESTAMP_HEADER,
    HttpTransport,
    TransportError,
    run_job,
)
from nookscanner_reconstruction.signing import verify_payload

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/shared/src/fixtures/job-request-v2.json").read_text(
        encoding="utf-8"
    )
)
SECRET = "s" * 40


def make_job(part_sizes=(3, 4)):
    data = copy.deepcopy(FIXTURE["valid"])
    data["inputs"] = [data["inputs"][0]]
    parts = [
        {"partNumber": i + 1, "sizeBytes": n, "downloadUrl": f"https://storage.example/p{i + 1}"}
        for i, n in enumerate(part_sizes)
    ]
    data["inputs"][0]["parts"] = parts
    data["inputs"][0]["sizeBytes"] = sum(part_sizes)
    return parse_job_request(data)


class FakeTransport:
    def __init__(self, blobs, upload_paths=None, fail_callback=False):
        self.blobs = blobs
        self.events = []
        self.uploads = {}
        self.upload_paths = upload_paths
        self.fail_callback = fail_callback

    def post_event(self, event):
        if self.fail_callback and event["kind"] == "failed":
            raise TransportError("CALLBACK_FAILED", "down")
        self.events.append(event)
        if event["kind"] == "upload_urls":
            paths = self.upload_paths if self.upload_paths is not None else [f["path"] for f in event["files"]]
            return {"uploads": [{"path": p, "url": f"https://upload.example/{p}"} for p in paths]}
        return {"applied": True}

    def download(self, url, dest):
        dest.write_bytes(self.blobs[url])

    def upload(self, url, src, content_type):
        self.uploads[url] = (src.read_bytes(), content_type)


def ok_provider(job, videos, workdir, report):
    report("training", 0.5)
    report("done", 1.0)
    pkg = workdir / "package"
    (pkg / "stream").mkdir(parents=True, exist_ok=True)
    (pkg / "scene.sog").write_bytes(b"SOG" + videos[0].read_bytes())
    (pkg / "stream" / "lod-meta.json").write_text("{}", encoding="utf-8")
    return {"heldout": {"psnr": 27.1}}


class RunnerTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.workdir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_success_joins_parts_uploads_and_reports_hashes(self):
        job = make_job((3, 4))
        t = FakeTransport({"https://storage.example/p1": b"abc", "https://storage.example/p2": b"defg"})
        result = run_job(job, t, self.workdir, ok_provider)
        self.assertTrue(result.succeeded)
        kinds = [e["kind"] for e in t.events]
        self.assertEqual(kinds[0], "progress")
        self.assertEqual(kinds[-2:], ["upload_urls", "succeeded"])
        stages = [e["stage"] for e in t.events if e["kind"] == "progress"]
        self.assertNotIn("done", stages)
        progress = [e["progress"] for e in t.events if e["kind"] == "progress"]
        self.assertEqual(progress, sorted(progress))
        done = t.events[-1]
        self.assertEqual(
            {f["path"] for f in done["files"]}, {"scene.sog", "stream/lod-meta.json"}
        )
        sog = next(f for f in done["files"] if f["path"] == "scene.sog")
        self.assertEqual(sog["sha256"], hashlib.sha256(b"SOGabcdefg").hexdigest())
        self.assertEqual(t.uploads["https://upload.example/scene.sog"][0], b"SOGabcdefg")
        self.assertEqual(done["report"], {"heldout": {"psnr": 27.1}})

    def test_wrong_part_size_is_a_transient_download_failure(self):
        job = make_job((3, 4))
        t = FakeTransport({"https://storage.example/p1": b"abc", "https://storage.example/p2": b"de"})
        result = run_job(job, t, self.workdir, ok_provider)
        self.assertEqual(result.code, "DOWNLOAD_FAILED")
        self.assertEqual(t.events[-1]["kind"], "failed")
        self.assertTrue(t.events[-1]["transient"])

    def test_pipeline_errors_are_permanent(self):
        def bad(job, videos, workdir, report):
            raise PipelineError("POSE_ESTIMATION_FAILED", "Too few cameras could be placed.")

        t = FakeTransport({"https://storage.example/p1": b"abc", "https://storage.example/p2": b"defg"})
        result = run_job(make_job(), t, self.workdir, bad)
        self.assertEqual(result.code, "POSE_ESTIMATION_FAILED")
        self.assertFalse(t.events[-1]["transient"])

    def test_missing_upload_url_fails_without_reporting_success(self):
        t = FakeTransport(
            {"https://storage.example/p1": b"abc", "https://storage.example/p2": b"defg"},
            upload_paths=["scene.sog"],
        )
        result = run_job(make_job(), t, self.workdir, ok_provider)
        self.assertEqual(result.code, "UPLOAD_FAILED")
        self.assertNotIn("succeeded", [e["kind"] for e in t.events])

    def test_unexpected_errors_are_reported_without_internal_details(self):
        def crash(job, videos, workdir, report):
            raise ValueError("secret path /home/x")

        t = FakeTransport({"https://storage.example/p1": b"abc", "https://storage.example/p2": b"defg"})
        result = run_job(make_job(), t, self.workdir, crash)
        self.assertEqual(result.code, "INTERNAL_ERROR")
        self.assertNotIn("/home/x", t.events[-1]["message"])

    def test_unreachable_platform_on_failure_does_not_raise(self):
        t = FakeTransport({}, fail_callback=True)
        result = run_job(make_job(), t, self.workdir, ok_provider)
        self.assertFalse(result.succeeded)

    def test_resumed_attempt_reuses_downloaded_parts(self):
        job = make_job((3, 4))
        blobs = {"https://storage.example/p1": b"abc", "https://storage.example/p2": b"defg"}
        run_job(job, FakeTransport(blobs), self.workdir, ok_provider)
        second = FakeTransport({})  # no blobs: a re-download would fail
        self.assertTrue(run_job(job, second, self.workdir, ok_provider).succeeded)


class HttpTransportTest(unittest.TestCase):
    def test_callbacks_are_hmac_signed(self):
        received = {}

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                body = self.rfile.read(int(self.headers["content-length"])).decode()
                received["ok"] = verify_payload(
                    SECRET, int(self.headers[TIMESTAMP_HEADER]), body, self.headers[SIGNATURE_HEADER]
                )
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"applied": true}')

            def log_message(self, *args):
                pass

        server = HTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            t = HttpTransport(f"http://127.0.0.1:{server.server_port}/cb", SECRET, timeout=5)
            self.assertEqual(t.post_event({"kind": "progress"}), {"applied": True})
            self.assertEqual(received["ok"], (True, None))
        finally:
            server.shutdown()

    def test_unreachable_callback_raises_transport_error(self):
        t = HttpTransport("http://127.0.0.1:9/cb", SECRET, timeout=2)
        with self.assertRaises(TransportError):
            t.post_event({"kind": "progress"})


if __name__ == "__main__":
    unittest.main()
