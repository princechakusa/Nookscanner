"""Modal deployment of the reconstruction worker (ADR-004, ADR-018).

Cost control (user decision): the Modal workspace runs on the free monthly credit plus at most
USD 30; the spend limit is set by the user in the Modal dashboard, so the bill can never exceed it.
When the limit is reached, Modal refuses new work, the dispatcher sees a 5xx (GPU_UNAVAILABLE,
transient) and jobs wait in the queue with back-off until the next month.

Flow: the `dispatch-processing` Edge Function POSTs a signed job request to `submit` (web
endpoint). `submit` verifies the HMAC, validates the contract and spawns `reconstruct` on a GPU,
which runs runner.run_job (download parts, pipeline, signed upload URLs, callbacks).

Deploy (user, once): `modal token new`; create the secret
    modal secret create nookscanner-staging WORKER_HMAC_SECRET=<same value as in Supabase>
then from the repository root: `modal deploy services/reconstruction/modal_app.py`.
The printed `submit` URL becomes WORKER_URL in Supabase (docs/DEPLOYMENT.md section 3).
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path

import modal

REPO_ROOT = Path(__file__).resolve().parents[2]
GPU = os.environ.get("NOOK_MODAL_GPU", "L40S")
# Price per second for the GPU above (VERIFIED 2026-11-19, https://modal.com/pricing); used only
# for the per-job cost estimate stored in the report. Re-check when prices change.
GPU_USD_PER_SECOND = {"L40S": 0.000542, "A100-80GB": 0.000694}.get(GPU, 0.000542)
JOB_TIMEOUT_SECONDS = 4 * 3600

app = modal.App("nookscanner-reconstruction")
secret = modal.Secret.from_name(os.environ.get("NOOK_MODAL_SECRET", "nookscanner-staging"))
jobs_volume = modal.Volume.from_name("nookscanner-jobs", create_if_missing=True)

worker_image = (
    modal.Image.from_dockerfile(
        REPO_ROOT / "services/reconstruction/Dockerfile.gpu", context_dir=REPO_ROOT
    )
    # Ubuntu 24.04 has python3 only; Modal looks for `python` (a layer on top keeps the cache).
    .run_commands("ln -sf /usr/bin/python3 /usr/local/bin/python")
    .entrypoint([])
)

endpoint_image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install("fastapi[standard]==0.162.0")
    .add_local_python_source("nookscanner_reconstruction")
)


@app.function(
    image=worker_image,
    gpu=GPU,
    timeout=JOB_TIMEOUT_SECONDS,
    secrets=[secret],
    volumes={"/jobs": jobs_volume},
    retries=0,  # retries are the platform's job (back-off per attempt), never Modal's
)
def reconstruct(raw_job: dict) -> dict:
    from nookscanner_reconstruction.contract import parse_job_request
    from nookscanner_reconstruction.providers import pipeline_provider
    from nookscanner_reconstruction.runner import HttpTransport, run_job

    job = parse_job_request(raw_job)
    started = time.time()

    def timed_provider(job_, videos, workdir, report):
        result = pipeline_provider(job_, videos, workdir, report)
        seconds = round(time.time() - started, 1)
        result["compute"] = {
            "target": "modal",
            "gpu": GPU,
            "seconds": seconds,
            "usd_estimate": round(seconds * GPU_USD_PER_SECOND, 4),
        }
        return result

    workdir = Path("/jobs") / job.job_id / f"a{job.attempt}"
    workdir.mkdir(parents=True, exist_ok=True)
    transport = HttpTransport(job.callback_url, os.environ["WORKER_HMAC_SECRET"])
    result = run_job(job, transport, workdir, timed_provider)
    jobs_volume.commit()
    return {"succeeded": result.succeeded, "code": result.code}


@app.function(image=endpoint_image, secrets=[secret], timeout=60)
@modal.fastapi_endpoint(method="POST")
async def submit(request):  # type: ignore[no-untyped-def]
    from fastapi.responses import JSONResponse

    from nookscanner_reconstruction.contract import ContractError, parse_job_request
    from nookscanner_reconstruction.runner import SIGNATURE_HEADER, TIMESTAMP_HEADER
    from nookscanner_reconstruction.signing import verify_payload

    body = (await request.body()).decode("utf-8", errors="replace")
    if len(body) > 512 * 1024:
        return JSONResponse({"error": {"code": "PAYLOAD_TOO_LARGE"}}, status_code=413)
    try:
        timestamp = int(request.headers.get(TIMESTAMP_HEADER, "0"))
    except ValueError:
        timestamp = 0
    ok, _reason = verify_payload(
        os.environ["WORKER_HMAC_SECRET"], timestamp, body, request.headers.get(SIGNATURE_HEADER, "")
    )
    if not ok:
        return JSONResponse({"error": {"code": "UNAUTHORIZED"}}, status_code=401)
    try:
        raw = json.loads(body)
        parse_job_request(raw)
    except (json.JSONDecodeError, ContractError):
        return JSONResponse({"error": {"code": "VALIDATION_FAILED"}}, status_code=400)
    await reconstruct.spawn.aio(raw)
    return JSONResponse({"accepted": True}, status_code=202)
