/**
 * Stage 6.2 platform side of the reconstruction contract v2: dispatch (queue -> worker) and the
 * worker callback (progress, upload URLs, success, failure). Pure TypeScript with injected
 * database/storage/fetch so it runs under Vitest and inside Supabase Edge Functions (Deno).
 * Security (threat T09): every worker request is HMAC-signed with a timestamp; events are applied
 * through private.apply_job_event, which ignores stale attempts, finished jobs and progress that
 * would move backwards, so replays are harmless.
 */
import {
  CONTRACT_VERSION,
  MAX_CALLBACK_BYTES,
  WORKER_SIGNATURE_HEADER,
  WORKER_TIMESTAMP_HEADER,
  jobRequestSchema,
  sceneOutputPath,
  workerEventSchema,
  type JobRequest,
} from '../../../packages/shared/src/processing.ts';
import { signPayload, verifyPayload } from '../../../packages/shared/src/signing.ts';

export interface JobRow {
  id: string;
  organization_id: string;
  apartment_id: string;
  scan_session_id: string;
  provider: 'self_hosted_gsplat' | 'varjo_teleport';
  status: string;
  attempt: number;
  parameters: Record<string, unknown>;
}

export interface InputRow {
  uploadId: string;
  mime: 'video/mp4' | 'video/quicktime';
  sizeBytes: number;
  parts: Array<{ partNumber: number; sizeBytes: number; objectPath: string }>;
}

export interface JobEvent {
  jobId: string;
  attempt: number;
  kind: 'progress' | 'succeeded' | 'failed';
  stage?: string | null;
  progress?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  transient?: boolean;
  report?: Record<string, unknown> | null;
}

export interface PlatformDb {
  getJob(id: string): Promise<JobRow | null>;
  applyEvent(e: JobEvent): Promise<boolean>;
  claimJobs(limit: number): Promise<JobRow[]>;
  requeueStalled(): Promise<number>;
  jobInputs(job: JobRow): Promise<InputRow[]>;
}

export interface PlatformStorage {
  /** Signed GET URL for a raw-footage part. */
  signedDownloadUrl(path: string, expiresInSeconds: number): Promise<string>;
  /** Signed PUT URL for an output file in scene-drafts. */
  signedUploadUrl(path: string): Promise<string>;
}

const DEFAULT_PARAMETERS = {
  maxGaussians: 3_000_000,
  trainingSteps: 30_000,
  frameSampleFps: 2,
  captureTier: null,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// ------------------------------------------------------------------------- callback

export interface CallbackDeps {
  db: PlatformDb;
  storage: PlatformStorage;
  secret: string;
  nowSeconds?: number;
}

/**
 * POST /job-callback. Uniform 401 for any signature problem (no oracle); 400 for malformed events;
 * 409 when the event no longer applies (stale attempt / finished job).
 */
export async function handleJobCallback(req: Request, deps: CallbackDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: { code: 'METHOD_NOT_ALLOWED' } });
  if (deps.secret.length < 32) return json(503, { error: { code: 'NOT_CONFIGURED' } });
  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > MAX_CALLBACK_BYTES) return json(413, { error: { code: 'PAYLOAD_TOO_LARGE' } });
  const body = await req.text();
  if (body.length > MAX_CALLBACK_BYTES) return json(413, { error: { code: 'PAYLOAD_TOO_LARGE' } });

  const timestamp = Number(req.headers.get(WORKER_TIMESTAMP_HEADER));
  const signature = req.headers.get(WORKER_SIGNATURE_HEADER) ?? '';
  const verified = await verifyPayload({
    secret: deps.secret,
    timestamp,
    body,
    signature,
    ...(deps.nowSeconds !== undefined ? { nowSeconds: deps.nowSeconds } : {}),
  });
  if (!verified.ok) return json(401, { error: { code: 'UNAUTHORIZED' } });

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return json(400, { error: { code: 'VALIDATION_FAILED' } });
  }
  const parsed = workerEventSchema.safeParse(raw);
  if (!parsed.success) return json(400, { error: { code: 'VALIDATION_FAILED' } });
  const event = parsed.data;

  const job = await deps.db.getJob(event.jobId);
  if (!job || job.attempt !== event.attempt || !['dispatched', 'running'].includes(job.status)) {
    return json(409, { error: { code: 'CONFLICT' } });
  }

  if (event.kind === 'upload_urls') {
    const uploads = [];
    for (const f of event.files) {
      const path = sceneOutputPath({
        organizationId: job.organization_id,
        apartmentId: job.apartment_id,
        jobId: job.id,
        attempt: job.attempt,
        file: f.path,
      });
      uploads.push({ path: f.path, url: await deps.storage.signedUploadUrl(path) });
    }
    return json(200, { uploads });
  }

  const applied =
    event.kind === 'progress'
      ? await deps.db.applyEvent({
          jobId: job.id,
          attempt: event.attempt,
          kind: 'progress',
          stage: event.stage,
          progress: event.progress,
        })
      : event.kind === 'succeeded'
        ? await deps.db.applyEvent({
            jobId: job.id,
            attempt: event.attempt,
            kind: 'succeeded',
            // The file list (with hashes and storage paths) is part of the stored report.
            report: {
              ...event.report,
              files: event.files.map((f) => ({
                ...f,
                storagePath: sceneOutputPath({
                  organizationId: job.organization_id,
                  apartmentId: job.apartment_id,
                  jobId: job.id,
                  attempt: job.attempt,
                  file: f.path,
                }),
              })),
            },
          })
        : await deps.db.applyEvent({
            jobId: job.id,
            attempt: event.attempt,
            kind: 'failed',
            errorCode: event.code,
            errorMessage: event.message,
            transient: event.transient,
          });
  return json(200, { applied });
}

// ------------------------------------------------------------------------- dispatch

export interface DispatchDeps {
  db: PlatformDb;
  storage: PlatformStorage;
  secret: string;
  workerUrl: string;
  callbackUrl: string;
  fetch: typeof fetch;
  nowSeconds?: () => number;
  limit?: number;
}

export interface DispatchResult {
  requeued: number;
  dispatched: string[];
  failed: Array<{ jobId: string; code: string }>;
}

/** Builds the signed job request for one claimed job (contract v2). */
export async function buildJobRequest(
  job: JobRow,
  deps: Pick<DispatchDeps, 'db' | 'storage' | 'callbackUrl'>,
): Promise<JobRequest> {
  const inputs = await deps.db.jobInputs(job);
  const request = {
    contractVersion: CONTRACT_VERSION,
    jobId: job.id,
    attempt: job.attempt,
    organizationId: job.organization_id,
    apartmentId: job.apartment_id,
    provider: job.provider,
    inputs: await Promise.all(
      inputs.map(async (i) => ({
        uploadId: i.uploadId,
        mime: i.mime,
        sizeBytes: i.sizeBytes,
        parts: await Promise.all(
          i.parts.map(async (p) => ({
            partNumber: p.partNumber,
            sizeBytes: p.sizeBytes,
            // Long enough for a queued GPU job to start; parts are private, never public.
            downloadUrl: await deps.storage.signedDownloadUrl(p.objectPath, 6 * 3600),
          })),
        ),
      })),
    ),
    callbackUrl: deps.callbackUrl,
    parameters: { ...DEFAULT_PARAMETERS, ...job.parameters },
  };
  return jobRequestSchema.parse(request);
}

/**
 * One dispatcher tick (run by a schedule): re-queue silent jobs, claim due jobs, send each to the
 * worker. A worker that cannot be reached is a transient failure (retried with back-off).
 */
export async function runDispatch(deps: DispatchDeps): Promise<DispatchResult> {
  const result: DispatchResult = {
    requeued: await deps.db.requeueStalled(),
    dispatched: [],
    failed: [],
  };
  for (const job of await deps.db.claimJobs(deps.limit ?? 5)) {
    let code: string | null = null;
    let transient = true;
    try {
      const request = await buildJobRequest(job, deps);
      const body = JSON.stringify(request);
      const ts = deps.nowSeconds ? deps.nowSeconds() : Math.floor(Date.now() / 1000);
      const res = await deps.fetch(deps.workerUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [WORKER_TIMESTAMP_HEADER]: String(ts),
          [WORKER_SIGNATURE_HEADER]: await signPayload(deps.secret, ts, body),
        },
        body,
      });
      if (!res.ok) {
        code = res.status >= 500 || res.status === 429 ? 'GPU_UNAVAILABLE' : 'WORKER_REJECTED';
        transient = code === 'GPU_UNAVAILABLE';
      }
    } catch (error) {
      code =
        error instanceof Error && error.name === 'ZodError' ? 'INVALID_INPUTS' : 'DISPATCH_FAILED';
      transient = code === 'DISPATCH_FAILED';
    }
    if (code) {
      await deps.db.applyEvent({
        jobId: job.id,
        attempt: job.attempt,
        kind: 'failed',
        errorCode: code,
        errorMessage: 'The processing service could not start this job.',
        transient,
      });
      result.failed.push({ jobId: job.id, code });
    } else {
      result.dispatched.push(job.id);
    }
  }
  return result;
}

/** POST /dispatch-processing, called by the scheduler with a shared bearer secret. */
export async function handleDispatch(
  req: Request,
  deps: DispatchDeps & { dispatchSecret: string },
): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: { code: 'METHOD_NOT_ALLOWED' } });
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${deps.dispatchSecret}`;
  if (deps.dispatchSecret.length < 32 || !timingSafeEqual(auth, expected)) {
    return json(401, { error: { code: 'UNAUTHORIZED' } });
  }
  if (deps.secret.length < 32 || !deps.workerUrl.startsWith('https://')) {
    return json(503, { error: { code: 'NOT_CONFIGURED' } });
  }
  return json(200, await runDispatch(deps));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ------------------------------------------------------------------------- pull mode (ADR-018)

export interface ClaimDeps {
  db: PlatformDb;
  storage: PlatformStorage;
  secret: string;
  callbackUrl: string;
  nowSeconds?: () => number;
}

/**
 * POST /claim-job: a worker that cannot be reached from the internet (the user's own GPU PC)
 * asks for the next job. The request is HMAC-signed like callbacks (body: {"workerId": "..."}).
 * Returns {"job": JobRequest} or {"job": null}. Claiming moves the job to `dispatched`, so the
 * stalled-job sweep re-queues it if the PC is switched off mid-job.
 */
export async function handleClaim(req: Request, deps: ClaimDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: { code: 'METHOD_NOT_ALLOWED' } });
  if (deps.secret.length < 32) return json(503, { error: { code: 'NOT_CONFIGURED' } });
  const body = await req.text();
  if (body.length > 4096) return json(413, { error: { code: 'PAYLOAD_TOO_LARGE' } });
  const now = deps.nowSeconds ? deps.nowSeconds() : undefined;
  const verified = await verifyPayload({
    secret: deps.secret,
    timestamp: Number(req.headers.get(WORKER_TIMESTAMP_HEADER)),
    body,
    signature: req.headers.get(WORKER_SIGNATURE_HEADER) ?? '',
    ...(now !== undefined ? { nowSeconds: now } : {}),
  });
  if (!verified.ok) return json(401, { error: { code: 'UNAUTHORIZED' } });

  await deps.db.requeueStalled();
  const [job] = await deps.db.claimJobs(1);
  if (!job) return json(200, { job: null });
  try {
    const request = await buildJobRequest(job, deps);
    return json(200, { job: request });
  } catch {
    await deps.db.applyEvent({
      jobId: job.id,
      attempt: job.attempt,
      kind: 'failed',
      errorCode: 'INVALID_INPUTS',
      errorMessage: 'The uploaded files are incomplete.',
      transient: false,
    });
    return json(200, { job: null });
  }
}
