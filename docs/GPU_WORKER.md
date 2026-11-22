# Nookscanner: 3D Processing Setup (Modal now, own GPU PC later)

Version 1.0 (2026-11-20). Decision: [ADR-018](DECISION_LOG.md) (Modal free monthly credit plus at most USD 30/month; the same worker on the user's own NVIDIA PC later). Both targets run **the same container image** (`services/reconstruction/Dockerfile.gpu`) and the same tested code (`runner.py`), so switching costs nothing.

Never paste tokens or secrets into a chat or a file in the repository. The commands below ask for them in your own terminal or browser.

## 0. One shared secret (both options)

The platform and the worker prove messages to each other with a shared secret (HMAC).

1. Create it once in a terminal: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
2. Store it in Supabase: `npx supabase@3.2.0 secrets set WORKER_HMAC_SECRET=<the value>` (from the repository root).
3. Use the same value for the worker (Modal secret in section 1, or the environment variable in section 2).

## 1. Modal (now)

**Status 2026-11-22:** steps 1-5 DONE. Workspace `chakusaprince`; secret `nookscanner-staging` (WORKER_HMAC_SECRET, same value as the Supabase secret); app `nookscanner-reconstruction` deployed (image ~18 min to build; the 65 worker tests run and pass INSIDE the image during the build). `submit` URL: `https://chakusaprince--nookscanner-reconstruction-submit.us-east.modal.run` (rejects unsigned requests). The build context is the repository filtered by `.dockerignore` (worker, contract fixtures, tier table only; `modal_app.py` excluded so editing it does not rebuild). Remaining: step 6 (deploy the Supabase functions with `WORKER_URL`) needs deployment approval.

What it costs: Modal's Starter plan includes free usage every month (USD 30 at the 2026-11-19 price check, https://modal.com/pricing; re-check when signing up). With the spend limit below, **the bill can never exceed the amount you set**.

1. Create an account at https://modal.com (sign in with GitHub or Google).
2. Settings > Usage and billing: set the **workspace spend limit** to the free credit plus USD 30 (your decision), or to the free credit only for USD 0.
3. In a terminal: `pip install modal==1.6.3` then `modal token new` (opens the browser to approve; no token is shown in chat).
4. `modal secret create nookscanner-staging WORKER_HMAC_SECRET=<the value from section 0>`
5. From the repository root: `modal deploy services/reconstruction/modal_app.py` (on Windows set `PYTHONIOENCODING=utf-8` first, or the progress output fails to print). The first deploy builds the image (COLMAP, gsplat, SplatTransform), which takes a while. Note the printed URL of `submit`.
6. Point Supabase at it and deploy the functions (`docs/DEPLOYMENT.md` section 3): `WORKER_URL=<submit URL>`, deploy `dispatch-processing`, `job-callback` and `claim-job`, and schedule the dispatcher.

Each finished job stores its GPU time and an estimated cost in the scan's report (`compute.usd_estimate`), so monthly use is visible. When the limit is reached, jobs wait and continue next month; nothing is lost.

## 2. Your own GPU PC (later)

**Hardware:** NVIDIA RTX graphics card with **at least 12 GB** of video memory (for example RTX 3060 12 GB, RTX 4070; 16-24 GB for large apartments), 32 GB RAM recommended, about 100 GB free disk. An Intel or AMD graphics chip cannot run it.

**It does not have to be always on.** The PC asks Nookscanner for work only while the worker runs. Jobs wait in the queue until then; a job interrupted by switching off is put back in the queue automatically (about 30 minutes later).

**Setup (Windows, once):**
1. Install the latest NVIDIA driver (GeForce Experience or nvidia.com).
2. Install Docker Desktop with the WSL2 backend; in Settings > Resources > WSL integration enable your distribution. Check: `docker run --rm --gpus all nvidia/cuda:12.6.3-base-ubuntu24.04 nvidia-smi` lists your card.
3. From the repository root: `docker build -f services/reconstruction/Dockerfile.gpu -t nookscanner-worker .` (long first build).

**Run it while you want processing to happen:**

```
docker run --rm --gpus all -e NOOKSCANNER_WORKER_SECRET=<the value from section 0> -v C:\nookscanner-jobs:/data nookscanner-worker --claim-url https://nfcnckwjrwpofkrzribd.supabase.co/functions/v1/claim-job --workdir /data
```

Stop it with Ctrl+C (after a job finishes, or anytime: an interrupted job is re-queued). Without an NVIDIA GPU the worker refuses to start, so it never takes a job it cannot run.

**Using both:** if the Modal worker URL is configured, new jobs go to Modal; a running PC worker also takes queued jobs. To use only the PC, remove `WORKER_URL` from the Supabase secrets (the dispatcher then leaves jobs in the queue for the PC).
