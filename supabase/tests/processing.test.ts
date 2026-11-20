/**
 * Stage 6.2: reconstruction jobs. Submission (members), dispatch claims, idempotent callbacks,
 * retries with back-off, stalled-worker requeue, and access control (threat T09).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  asRole,
  asUser,
  createTestDb,
  createUser,
  expectError,
  slug,
  type TestDb,
} from './support/db.ts';

let db: TestDb;
const u = {} as Record<'owner' | 'viewer' | 'outsider', string>;
let org: string;
let apartment: string;

const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0]!;
const service = <T>(fn: Parameters<typeof asRole<T>>[3]) => asRole(db, 'service_role', null, fn);

/** A session with one fully uploaded video (as after Stage 5.1). */
async function uploadedSession(): Promise<string> {
  const s = await asUser(db, u.owner, (tx) =>
    one(
      tx.query<{ id: string }>(
        `insert into public.scan_sessions (apartment_id, method) values ($1, 'video_upload') returning id`,
        [apartment],
      ),
    ),
  );
  const up = await asUser(db, u.owner, (tx) =>
    one(
      tx.query<{ id: string }>(
        `select id from public.register_media_upload($1, 'walk.mp4', 'video/mp4', 1000)`,
        [s.id],
      ),
    ),
  );
  await db.query(`update public.media_uploads set status = 'uploaded' where id = $1`, [up.id]);
  await db.query(`update public.scan_sessions set status = 'uploaded' where id = $1`, [s.id]);
  return s.id;
}

const submit = (user: string, session: string) =>
  asUser(db, user, (tx) =>
    one(tx.query<{ id: string }>(`select public.submit_scan_for_processing($1) as id`, [session])),
  ).then((r) => r.id);

const job = (id: string) =>
  one(
    db.query<{
      status: string;
      attempt: number;
      progress: string;
      stage: string | null;
      error_code: string | null;
      next_attempt_at: string;
    }>(
      `select status::text, attempt, progress::text, stage, error_code, next_attempt_at::text from public.processing_jobs where id = $1`,
      [id],
    ),
  );

const claim = () =>
  service((tx) =>
    tx.query<{ id: string; attempt: number }>(
      `select id, attempt from private.claim_processing_jobs(10)`,
    ),
  ).then((r) => r.rows);

const event = (
  id: string,
  attempt: number,
  kind: string,
  extra: {
    stage?: string;
    progress?: number;
    code?: string;
    transient?: boolean;
    report?: object;
  } = {},
) =>
  service((tx) =>
    one(
      tx.query<{ ok: boolean }>(
        `select private.apply_job_event($1, $2, $3, $4, $5, $6, $7, $8, $9) as ok`,
        [
          id,
          attempt,
          kind,
          extra.stage ?? null,
          extra.progress ?? null,
          extra.code ?? null,
          extra.code ? 'details' : null,
          extra.transient ?? false,
          extra.report ? JSON.stringify(extra.report) : null,
        ],
      ),
    ),
  ).then((r) => r.ok);

beforeAll(async () => {
  db = await createTestDb();
  for (const k of ['owner', 'viewer', 'outsider'] as const)
    u[k] = await createUser(db, `proc-${k}`);
  org = (
    await asUser(db, u.owner, (tx) =>
      one(
        tx.query<{ id: string }>(`select public.create_organization('Proc Org', $1) as id`, [
          slug('proc-org'),
        ]),
      ),
    )
  ).id;
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'viewer')`,
    [org, u.viewer],
  );
  const property = await asUser(db, u.owner, (tx) =>
    one(
      tx.query<{ id: string }>(
        `insert into public.properties (organization_id, name) values ($1, 'P') returning id`,
        [org],
      ),
    ),
  );
  apartment = (
    await asUser(db, u.owner, (tx) =>
      one(
        tx.query<{ id: string }>(
          `insert into public.apartments (property_id, name) values ($1, 'A') returning id`,
          [property.id],
        ),
      ),
    )
  ).id;
}, 120_000);

describe('submission', () => {
  it('needs a fully uploaded scan, is idempotent, and moves the session to submitted', async () => {
    const empty = await asUser(db, u.owner, (tx) =>
      one(
        tx.query<{ id: string }>(
          `insert into public.scan_sessions (apartment_id, method) values ($1, 'video_upload') returning id`,
          [apartment],
        ),
      ),
    );
    expect(await expectError(submit(u.owner, empty.id))).toMatch(/NOT_READY/);
    const session = await uploadedSession();
    const a = await submit(u.owner, session);
    expect(await submit(u.owner, session)).toBe(a);
    const s = await one(
      db.query<{ status: string }>(`select status::text from public.scan_sessions where id = $1`, [
        session,
      ]),
    );
    expect(s.status).toBe('submitted');
    expect((await job(a)).status).toBe('queued');
  });

  it('viewers and other organizations cannot submit; nobody writes jobs directly', async () => {
    const session = await uploadedSession();
    for (const user of [u.viewer, u.outsider])
      expect(await expectError(submit(user, session))).toMatch(/NOT_FOUND/);
    const direct = await expectError(
      asUser(db, u.owner, (tx) =>
        tx.query(
          `insert into public.processing_jobs (organization_id, scan_session_id, apartment_id, idempotency_key) values ($1, $2, $3, 'x')`,
          [org, session, apartment],
        ),
      ),
    );
    expect(direct).toMatch(/permission denied/);
  });

  it('members cannot call the platform functions', async () => {
    for (const sql of [
      `select * from private.claim_processing_jobs(1)`,
      `select private.requeue_stalled_jobs()`,
    ]) {
      expect(await expectError(asUser(db, u.owner, (tx) => tx.query(sql)))).toMatch(
        /permission denied/,
      );
    }
  });
});

describe('dispatch and callbacks', () => {
  it('runs a job to success; stale, replayed and backwards events change nothing', async () => {
    const id = await submit(u.owner, await uploadedSession());
    const claimed = await claim();
    expect(claimed.find((c) => c.id === id)?.attempt).toBe(1);
    expect((await claim()).find((c) => c.id === id)).toBeUndefined(); // not claimed twice
    expect(await event(id, 1, 'progress', { stage: 'training', progress: 40 })).toBe(true);
    expect(await event(id, 1, 'progress', { stage: 'extracting_frames', progress: 10 })).toBe(
      false,
    );
    expect(await event(id, 2, 'progress', { stage: 'training', progress: 90 })).toBe(false);
    const running = await job(id);
    expect([running.status, running.stage, running.progress]).toEqual([
      'running',
      'training',
      '40.00',
    ]);

    const report = { heldout: { psnr: 27.4 }, sfm: { registered_ratio: 0.97 } };
    expect(await event(id, 1, 'succeeded', { report })).toBe(true);
    expect(await event(id, 1, 'succeeded', { report })).toBe(false); // replay
    expect(await event(id, 1, 'failed', { code: 'LATE' })).toBe(false); // late failure ignored
    expect((await job(id)).status).toBe('succeeded');

    // Results are readable by the organization's members only.
    const read = (user: string) =>
      asUser(
        db,
        user,
        async (tx) =>
          (
            await tx.query<{ report: { heldout: { psnr: number } } }>(
              `select r.report from public.processing_results r where r.processing_job_id = $1`,
              [id],
            )
          ).rows,
      );
    expect((await read(u.viewer))[0]?.report.heldout.psnr).toBe(27.4);
    expect(await read(u.outsider)).toEqual([]);
  });

  it('transient failures are retried with back-off, then fail for good', async () => {
    const id = await submit(u.owner, await uploadedSession());
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await db.query(`update public.processing_jobs set next_attempt_at = now() where id = $1`, [
        id,
      ]);
      expect((await claim()).find((c) => c.id === id)?.attempt).toBe(attempt);
      expect(await event(id, attempt, 'failed', { code: 'GPU_UNAVAILABLE', transient: true })).toBe(
        true,
      );
      const j = await job(id);
      if (attempt < 3) {
        expect(j.status).toBe('queued');
        expect(new Date(j.next_attempt_at).getTime()).toBeGreaterThan(Date.now() + 60_000);
      } else {
        expect([j.status, j.error_code]).toEqual(['failed', 'GPU_UNAVAILABLE']);
      }
    }
  });

  it('permanent failures stop at once; stalled workers are requeued', async () => {
    const id = await submit(u.owner, await uploadedSession());
    await claim();
    expect(await event(id, 1, 'failed', { code: 'VIDEO_TOO_SHORT', transient: false })).toBe(true);
    expect((await job(id)).status).toBe('failed');

    const stalled = await submit(u.owner, await uploadedSession());
    await claim();
    await db.query(
      `update public.processing_jobs set dispatched_at = now() - interval '2 hours' where id = $1`,
      [stalled],
    );
    const n = await service((tx) =>
      one(tx.query<{ n: number }>(`select private.requeue_stalled_jobs() as n`)),
    );
    expect(n.n).toBeGreaterThanOrEqual(1);
    expect(await job(stalled)).toMatchObject({ status: 'queued', error_code: 'WORKER_TIMEOUT' });
  });

  it('members can cancel; a cancelled job ignores later events', async () => {
    const id = await submit(u.owner, await uploadedSession());
    await claim();
    expect(
      await expectError(
        asUser(db, u.viewer, (tx) => tx.query(`select public.cancel_processing_job($1)`, [id])),
      ),
    ).toMatch(/NOT_FOUND/);
    await asUser(db, u.owner, (tx) => tx.query(`select public.cancel_processing_job($1)`, [id]));
    expect((await job(id)).status).toBe('cancelled');
    expect(await event(id, 1, 'progress', { stage: 'training', progress: 50 })).toBe(false);
  });
});
