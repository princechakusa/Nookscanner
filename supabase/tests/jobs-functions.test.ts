/**
 * Stage 6.2: Edge Function logic (dispatch + worker callback) against the real migrations through
 * the SQL adapter the functions use (threat T09: signatures, replays, stale attempts).
 */
import {
  WORKER_SIGNATURE_HEADER,
  WORKER_TIMESTAMP_HEADER,
  jobRequestSchema,
  signPayload,
  verifyPayload,
  type JobRequest,
} from '@nookscanner/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  handleDispatch,
  handleJobCallback,
  runDispatch,
  type DispatchDeps,
  type PlatformStorage,
} from '../functions/_shared/jobs.ts';
import { sqlPlatformDb } from '../functions/_shared/sql-db.ts';
import { asUser, createTestDb, createUser, slug, type TestDb } from './support/db.ts';

const SECRET = 'w'.repeat(40);
const DISPATCH_SECRET = 'd'.repeat(40);
let db: TestDb;
let owner: string;
let apartment: string;
let org: string;

const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0]!;

const storage: PlatformStorage = {
  signedDownloadUrl: async (path, exp) => `https://storage.test/raw/${path}?exp=${exp}`,
  signedUploadUrl: async (path) => `https://storage.test/upload/${path}`,
};

/** A submitted job whose single upload (one part) is fully uploaded. */
async function submittedJob(): Promise<string> {
  const session = await asUser(db, owner, (tx) =>
    one(
      tx.query<{ id: string }>(
        `insert into public.scan_sessions (apartment_id, method) values ($1, 'video_upload') returning id`,
        [apartment],
      ),
    ),
  );
  const up = await asUser(db, owner, (tx) =>
    one(
      tx.query<{ id: string }>(
        `select id from public.register_media_upload($1, 'walk.mp4', 'video/mp4', 1000)`,
        [session.id],
      ),
    ),
  );
  await db.query(
    `update public.media_upload_parts set status = 'uploaded', uploaded_at = now() where media_upload_id = $1`,
    [up.id],
  );
  await db.query(`update public.media_uploads set status = 'uploaded' where id = $1`, [up.id]);
  await db.query(`update public.scan_sessions set status = 'uploaded' where id = $1`, [session.id]);
  return (
    await asUser(db, owner, (tx) =>
      one(
        tx.query<{ id: string }>(`select public.submit_scan_for_processing($1) as id`, [
          session.id,
        ]),
      ),
    )
  ).id;
}

const jobRow = (id: string) =>
  one(
    db.query<{ status: string; attempt: number; progress: string; error_code: string | null }>(
      `select status::text, attempt, progress::text, error_code from public.processing_jobs where id = $1`,
      [id],
    ),
  );

function workerFetch(status: number, sink: Array<{ headers: Headers; body: string }>) {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    sink.push({ headers: new Headers(init?.headers), body: String(init?.body) });
    return new Response('{}', { status });
  }) as typeof fetch;
}

function dispatchDeps(fetchImpl: typeof fetch): DispatchDeps {
  return {
    db: sqlPlatformDb(db),
    storage,
    secret: SECRET,
    workerUrl: 'https://worker.test/jobs',
    callbackUrl: 'https://project.test/functions/v1/job-callback',
    fetch: fetchImpl,
    limit: 20,
  };
}

async function signed(body: unknown, opts: { secret?: string; ts?: number } = {}) {
  const text = JSON.stringify(body);
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  return new Request('https://project.test/functions/v1/job-callback', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [WORKER_TIMESTAMP_HEADER]: String(ts),
      [WORKER_SIGNATURE_HEADER]: await signPayload(opts.secret ?? SECRET, ts, text),
    },
    body: text,
  });
}

const callback = (req: Request) =>
  handleJobCallback(req, { db: sqlPlatformDb(db), storage, secret: SECRET });

/** Dispatches every due job and returns the request the worker received for `jobId`. */
async function dispatchAndCapture(jobId: string): Promise<JobRequest> {
  const sink: Array<{ headers: Headers; body: string }> = [];
  await runDispatch(dispatchDeps(workerFetch(202, sink)));
  const hit = sink.map((s) => JSON.parse(s.body) as JobRequest).find((r) => r.jobId === jobId);
  if (!hit) throw new Error('job was not dispatched');
  return hit;
}

beforeAll(async () => {
  db = await createTestDb();
  owner = await createUser(db, 'jobs-owner');
  org = (
    await asUser(db, owner, (tx) =>
      one(
        tx.query<{ id: string }>(`select public.create_organization('Jobs Org', $1) as id`, [
          slug('jobs-org'),
        ]),
      ),
    )
  ).id;
  apartment = await asUser(db, owner, async (tx) => {
    const p = await one(
      tx.query<{ id: string }>(
        `insert into public.properties (organization_id, name) values ($1, 'P') returning id`,
        [org],
      ),
    );
    return (
      await one(
        tx.query<{ id: string }>(
          `insert into public.apartments (property_id, name) values ($1, 'A') returning id`,
          [p.id],
        ),
      )
    ).id;
  });
}, 120_000);

describe('dispatch', () => {
  it('sends a signed, contract-valid request with signed part URLs', async () => {
    const id = await submittedJob();
    const sink: Array<{ headers: Headers; body: string }> = [];
    const result = await runDispatch(dispatchDeps(workerFetch(202, sink)));
    expect(result.dispatched).toContain(id);
    const sent = sink.find((s) => (JSON.parse(s.body) as JobRequest).jobId === id)!;
    const verified = await verifyPayload({
      secret: SECRET,
      timestamp: Number(sent.headers.get(WORKER_TIMESTAMP_HEADER)),
      body: sent.body,
      signature: sent.headers.get(WORKER_SIGNATURE_HEADER) ?? '',
    });
    expect(verified).toEqual({ ok: true });
    const request = jobRequestSchema.parse(JSON.parse(sent.body));
    expect(request.attempt).toBe(1);
    expect(request.inputs[0]!.parts[0]!.downloadUrl).toMatch(
      new RegExp(`^https://storage\\.test/raw/org/${org}/scans/.+part-00001\\.mp4\\?exp=21600$`),
    );
    expect((await jobRow(id)).status).toBe('dispatched');
  });

  it('re-queues on a busy worker (transient) and fails on a rejected request (permanent)', async () => {
    const busy = await submittedJob();
    await runDispatch(dispatchDeps(workerFetch(503, [])));
    expect(await jobRow(busy)).toMatchObject({ status: 'queued', error_code: 'GPU_UNAVAILABLE' });

    await db.query(`update public.processing_jobs set status = 'cancelled' where id = $1`, [busy]);
    const rejected = await submittedJob();
    await runDispatch(dispatchDeps(workerFetch(400, [])));
    expect(await jobRow(rejected)).toMatchObject({
      status: 'failed',
      error_code: 'WORKER_REJECTED',
    });
  });

  it('requires the scheduler secret and a configured worker', async () => {
    const deps = { ...dispatchDeps(workerFetch(202, [])), dispatchSecret: DISPATCH_SECRET };
    const post = (auth: string) =>
      new Request('https://x.test/dispatch', { method: 'POST', headers: { authorization: auth } });
    expect((await handleDispatch(post('Bearer nope'), deps)).status).toBe(401);
    expect(
      (await handleDispatch(post(`Bearer ${DISPATCH_SECRET}`), { ...deps, workerUrl: 'http://x' }))
        .status,
    ).toBe(503);
    expect((await handleDispatch(post(`Bearer ${DISPATCH_SECRET}`), deps)).status).toBe(200);
  });
});

describe('worker callback', () => {
  it('rejects unsigned, wrongly signed, stale and malformed requests', async () => {
    const id = await submittedJob();
    const { attempt } = await dispatchAndCapture(id);
    const ev = {
      contractVersion: 2,
      jobId: id,
      attempt,
      kind: 'progress',
      stage: 'training',
      progress: 40,
    };
    const unsigned = new Request('https://x.test', { method: 'POST', body: JSON.stringify(ev) });
    expect((await callback(unsigned)).status).toBe(401);
    expect((await callback(await signed(ev, { secret: 'x'.repeat(40) }))).status).toBe(401);
    expect(
      (await callback(await signed(ev, { ts: Math.floor(Date.now() / 1000) - 3600 }))).status,
    ).toBe(401);
    expect((await callback(await signed({ ...ev, stage: 'hacking' }))).status).toBe(400);
    expect((await callback(await signed({ ...ev, attempt: attempt + 1 }))).status).toBe(409);
    expect(
      (
        await handleJobCallback(await signed(ev), {
          db: sqlPlatformDb(db),
          storage,
          secret: 'short',
        })
      ).status,
    ).toBe(503);
  });

  it('applies progress once and ignores replays that would move backwards', async () => {
    const id = await submittedJob();
    const { attempt } = await dispatchAndCapture(id);
    const ev = (progress: number) => ({
      contractVersion: 2,
      jobId: id,
      attempt,
      kind: 'progress',
      stage: 'training',
      progress,
    });
    expect(await (await callback(await signed(ev(40)))).json()).toEqual({ applied: true });
    expect(await (await callback(await signed(ev(20)))).json()).toEqual({ applied: false });
    expect(await jobRow(id)).toMatchObject({ status: 'running', progress: '40.00' });
  });

  it('issues upload URLs only under the job folder and records the files on success', async () => {
    const id = await submittedJob();
    const { attempt } = await dispatchAndCapture(id);
    const base = { contractVersion: 2, jobId: id, attempt };

    const bad = await callback(
      await signed({
        ...base,
        kind: 'upload_urls',
        files: [{ path: '../../etc/passwd.json', sizeBytes: 1 }],
      }),
    );
    expect(bad.status).toBe(400);

    const res = await callback(
      await signed({
        ...base,
        kind: 'upload_urls',
        files: [
          { path: 'scene.sog', sizeBytes: 10 },
          { path: 'stream/lod-meta.json', sizeBytes: 2 },
        ],
      }),
    );
    const { uploads } = (await res.json()) as { uploads: Array<{ path: string; url: string }> };
    const prefix = `https://storage.test/upload/org/${org}/apartments/${apartment}/scenes/${id}/a${attempt}/`;
    expect(uploads).toEqual([
      { path: 'scene.sog', url: `${prefix}scene.sog` },
      { path: 'stream/lod-meta.json', url: `${prefix}stream/lod-meta.json` },
    ]);

    const sha = 'a'.repeat(64);
    const done = await callback(
      await signed({
        ...base,
        kind: 'succeeded',
        files: [{ path: 'scene.sog', sizeBytes: 10, sha256: sha }],
        report: { heldout: { psnr: 27 } },
      }),
    );
    expect(await done.json()).toEqual({ applied: true });
    expect((await jobRow(id)).status).toBe('succeeded');
    const report = await one(
      db.query<{
        report: { heldout: unknown; files: Array<{ storagePath: string; sha256: string }> };
      }>(
        `select report from public.processing_results r join public.processing_jobs j on j.id = r.processing_job_id where j.id = $1`,
        [id],
      ),
    );
    expect(report.report.heldout).toEqual({ psnr: 27 });
    expect(report.report.files[0]).toMatchObject({
      storagePath: `${prefix.replace('https://storage.test/upload/', '')}scene.sog`,
      sha256: sha,
    });

    // A late event for the finished job does nothing.
    const late = await callback(
      await signed({ ...base, kind: 'progress', stage: 'training', progress: 50 }),
    );
    expect(late.status).toBe(409);
  });

  it('re-queues transient worker failures and ends permanent ones', async () => {
    const transient = await submittedJob();
    const t = await dispatchAndCapture(transient);
    await callback(
      await signed({
        contractVersion: 2,
        jobId: transient,
        attempt: t.attempt,
        kind: 'failed',
        code: 'GPU_UNAVAILABLE',
        message: 'no capacity',
        transient: true,
      }),
    );
    expect(await jobRow(transient)).toMatchObject({
      status: 'queued',
      error_code: 'GPU_UNAVAILABLE',
    });

    const permanent = await submittedJob();
    const p = await dispatchAndCapture(permanent);
    await callback(
      await signed({
        contractVersion: 2,
        jobId: permanent,
        attempt: p.attempt,
        kind: 'failed',
        code: 'POSE_ESTIMATION_FAILED',
        message: 'too few cameras',
        transient: false,
      }),
    );
    expect(await jobRow(permanent)).toMatchObject({
      status: 'failed',
      error_code: 'POSE_ESTIMATION_FAILED',
    });
  });
});
