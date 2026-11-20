"""Stage 6.8: pull-mode worker (own GPU PC) against a local signed claim endpoint."""

from __future__ import annotations

import copy
import json
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from types import SimpleNamespace

from nookscanner_reconstruction.poll import has_nvidia_gpu, main, poll_once
from nookscanner_reconstruction.runner import SIGNATURE_HEADER, TIMESTAMP_HEADER, HttpTransport
from nookscanner_reconstruction.signing import verify_payload

FIXTURE = json.loads(
    (Path(__file__).resolve().parents[3] / "packages/shared/src/fixtures/job-request-v2.json").read_text(
        encoding="utf-8"
    )
)
SECRET = "p" * 40


class ClaimServer:
    """Signed claim endpoint that serves the queued jobs once each."""

    def __init__(self, jobs):
        self.jobs = list(jobs)
        self.verified = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def do_POST(self):  # noqa: N802
                body = self.rfile.read(int(self.headers["content-length"])).decode()
                outer.verified.append(
                    verify_payload(SECRET, int(self.headers[TIMESTAMP_HEADER]), body, self.headers[SIGNATURE_HEADER])
                )
                job = outer.jobs.pop(0) if outer.jobs else None
                payload = json.dumps({"job": job}).encode()
                self.send_response(200)
                self.send_header("content-type", "application/json")
                self.send_header("content-length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}/claim-job"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()


class RecordingTransport:
    def __init__(self, url, secret):
        self.url = url
        self.events = []

    def post_event(self, event):
        self.events.append(event)
        if event["kind"] == "upload_urls":
            return {"uploads": [{"path": f["path"], "url": f"https://u/{f['path']}"} for f in event["files"]]}
        return {"applied": True}

    def download(self, url, dest):
        dest.write_bytes(b"x" * self.size_for(url))

    def upload(self, url, src, content_type):
        pass

    sizes = {}

    def size_for(self, url):
        return RecordingTransport.sizes[url]


def ok_provider(job, videos, workdir, report):
    pkg = workdir / "package"
    pkg.mkdir(parents=True, exist_ok=True)
    (pkg / "scene.sog").write_bytes(b"SOG")
    return {"heldout": {"psnr": 26.0}}


class PollTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.workdir = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_empty_queue_returns_none_with_a_signed_claim(self):
        server = ClaimServer([])
        try:
            result = poll_once(HttpTransport(server.url, SECRET, timeout=5), SECRET, self.workdir, "pc-1")
            self.assertIsNone(result)
            self.assertEqual(server.verified, [(True, None)])
        finally:
            server.close()

    def test_claims_runs_and_reports_one_job_then_cleans_up(self):
        job = copy.deepcopy(FIXTURE["valid"])
        job["inputs"] = [job["inputs"][0]]
        for p in job["inputs"][0]["parts"]:
            RecordingTransport.sizes[p["downloadUrl"]] = p["sizeBytes"]
        made = {}

        def make(url, secret):
            made["t"] = RecordingTransport(url, secret)
            return made["t"]

        server = ClaimServer([job])
        try:
            result = poll_once(
                HttpTransport(server.url, SECRET, timeout=5), SECRET, self.workdir, "pc-1", ok_provider, make
            )
        finally:
            server.close()
        self.assertTrue(result.succeeded)
        self.assertEqual(made["t"].url, job["callbackUrl"])
        self.assertEqual(made["t"].events[-1]["kind"], "succeeded")
        self.assertFalse((self.workdir / job["jobId"]).exists())

    def test_a_job_this_worker_cannot_parse_is_not_run(self):
        bad = copy.deepcopy(FIXTURE["valid"])
        bad["contractVersion"] = 99
        server = ClaimServer([bad])
        try:
            result = poll_once(HttpTransport(server.url, SECRET, timeout=5), SECRET, self.workdir, "pc-1")
        finally:
            server.close()
        self.assertEqual(result.code, "CONTRACT_MISMATCH")


class GpuCheckTest(unittest.TestCase):
    def test_gpu_detection_uses_nvidia_smi_output(self):
        import nookscanner_reconstruction.poll as poll

        original = poll.shutil.which
        try:
            poll.shutil.which = lambda name: None
            self.assertFalse(has_nvidia_gpu())
            poll.shutil.which = lambda name: "/usr/bin/nvidia-smi"
            yes = lambda *a, **k: SimpleNamespace(returncode=0, stdout="NVIDIA GeForce RTX 4070\n")
            no = lambda *a, **k: SimpleNamespace(returncode=9, stdout="")
            self.assertTrue(has_nvidia_gpu(run=yes))
            self.assertFalse(has_nvidia_gpu(run=no))
        finally:
            poll.shutil.which = original


class CliTest(unittest.TestCase):
    def test_refuses_without_secret_https_or_gpu(self):
        import os

        env = os.environ.pop("NOOKSCANNER_WORKER_SECRET", None)
        try:
            self.assertEqual(main(["--claim-url", "https://x/claim-job"]), 2)
            os.environ["NOOKSCANNER_WORKER_SECRET"] = SECRET
            self.assertEqual(main(["--claim-url", "http://evil.example/claim-job"]), 2)
            import nookscanner_reconstruction.poll as poll

            original = poll.has_nvidia_gpu
            poll.has_nvidia_gpu = lambda: False
            try:
                self.assertEqual(main(["--claim-url", "https://x/claim-job"]), 3)
            finally:
                poll.has_nvidia_gpu = original
        finally:
            os.environ.pop("NOOKSCANNER_WORKER_SECRET", None)
            if env is not None:
                os.environ["NOOKSCANNER_WORKER_SECRET"] = env


if __name__ == "__main__":
    unittest.main()
