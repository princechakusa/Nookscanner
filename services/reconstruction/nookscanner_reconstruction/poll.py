"""Stage 6.8 (ADR-018): pull-mode worker for the user's own GPU PC.

The PC asks the platform for work (`claim-job` Edge Function, HMAC-signed), runs it with
runner.run_job and reports back through `job-callback`. It needs no public address and does not
have to be always on: jobs wait in the queue until it is switched on; a job interrupted by
switching off is re-queued by the platform's stalled-job sweep.

Usage (inside the GPU container or a prepared WSL2/Linux environment):
    NOOKSCANNER_WORKER_SECRET=... python -m nookscanner_reconstruction.poll \\
        --claim-url https://<project>.supabase.co/functions/v1/claim-job --workdir /data/jobs
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path
from typing import Any, Callable

from .contract import ContractError, parse_job_request
from .providers import pipeline_provider
from .runner import HttpTransport, Provider, RunResult, TransportError, run_job

IDLE_SECONDS = 60
ERROR_BACKOFF_SECONDS = 120


def has_nvidia_gpu(run: Callable[..., Any] = subprocess.run) -> bool:
    """True when `nvidia-smi` lists at least one GPU (never claim work we cannot run)."""
    exe = shutil.which("nvidia-smi")
    if not exe:
        return False
    try:
        out = run([exe, "--query-gpu=name", "--format=csv,noheader"], capture_output=True, text=True, timeout=20)
    except (OSError, subprocess.SubprocessError):
        return False
    return out.returncode == 0 and bool(out.stdout.strip())


def claim(transport: HttpTransport, worker_id: str) -> dict[str, Any] | None:
    """Asks the platform for one job; None when the queue is empty."""
    answer = transport.post_event({"workerId": worker_id})
    job = answer.get("job")
    return job if isinstance(job, dict) else None


def poll_once(
    claim_transport: HttpTransport,
    secret: str,
    workdir: Path,
    worker_id: str,
    provider: Provider = pipeline_provider,
    make_transport: Callable[[str, str], Any] = HttpTransport,
) -> RunResult | None:
    """Claims and runs at most one job. Returns None when there was nothing to do."""
    raw = claim(claim_transport, worker_id)
    if raw is None:
        return None
    try:
        job = parse_job_request(raw)
    except ContractError as exc:
        # The platform sent something this worker version does not understand: report nothing
        # (no trusted callback URL); the stalled-job sweep re-queues it. Log for the operator.
        print(f"[poll] rejected job: {exc}", file=sys.stderr)
        return RunResult(False, "CONTRACT_MISMATCH")
    job_dir = workdir / job.job_id / f"a{job.attempt}"
    job_dir.mkdir(parents=True, exist_ok=True)
    result = run_job(job, make_transport(job.callback_url, secret), job_dir, provider)
    if result.succeeded:
        shutil.rmtree(workdir / job.job_id, ignore_errors=True)  # keep the disk tidy
    return result


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Nookscanner pull-mode GPU worker")
    p.add_argument("--claim-url", required=True)
    p.add_argument("--workdir", default=str(Path.home() / "nookscanner-jobs"))
    p.add_argument("--worker-id", default=socket.gethostname())
    p.add_argument("--once", action="store_true", help="claim at most one job, then exit")
    p.add_argument("--allow-no-gpu", action="store_true", help="testing only: skip the GPU check")
    args = p.parse_args(argv)

    secret = os.environ.get("NOOKSCANNER_WORKER_SECRET", "")
    if len(secret) < 32:
        print("NOOKSCANNER_WORKER_SECRET is missing or shorter than 32 characters.", file=sys.stderr)
        return 2
    if not args.claim_url.startswith("https://") and not args.claim_url.startswith("http://127.0.0.1"):
        print("--claim-url must be https.", file=sys.stderr)
        return 2
    if not args.allow_no_gpu and not has_nvidia_gpu():
        print("No NVIDIA GPU found (nvidia-smi). This worker only claims jobs it can run.", file=sys.stderr)
        return 3

    workdir = Path(args.workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    claimer = HttpTransport(args.claim_url, secret)
    print(f"[poll] worker {args.worker_id} waiting for jobs (Ctrl+C to stop)")
    while True:
        try:
            result = poll_once(claimer, secret, workdir, args.worker_id)
        except TransportError as exc:
            print(f"[poll] platform unreachable: {exc}", file=sys.stderr)
            if args.once:
                return 1
            time.sleep(ERROR_BACKOFF_SECONDS)
            continue
        if result is not None:
            print(f"[poll] job finished: {json.dumps(result.__dict__)}")
        if args.once:
            return 0
        if result is None:
            time.sleep(IDLE_SECONDS)


if __name__ == "__main__":
    raise SystemExit(main())
