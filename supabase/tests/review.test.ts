/** Stage 6.3: manager review of reconstruction results (product rule 8, quality bar s7). */
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, expectError, slug, type TestDb } from './support/db.ts';

let db: TestDb;
const u = {} as Record<'owner' | 'editor' | 'outsider', string>;
let org: string;
let apartment: string;

const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0]!;

/** A job in the given status (created as the platform would), with a stored report if succeeded. */
async function job(status: 'succeeded' | 'running'): Promise<string> {
  const s = await one(
    db.query<{ id: string }>(
      `insert into public.scan_sessions (apartment_id, method, created_by, status) values ($1, 'video_upload', $2, 'processing') returning id`,
      [apartment, u.owner],
    ),
  );
  const j = await one(
    db.query<{ id: string }>(
      `insert into public.processing_jobs (organization_id, scan_session_id, apartment_id, idempotency_key, status, attempt)
       values ($1, $2, $3, gen_random_uuid()::text, $4, 1) returning id`,
      [org, s.id, apartment, status],
    ),
  );
  if (status === 'succeeded') {
    await db.query(
      `insert into public.processing_results (organization_id, processing_job_id, report) values ($1, $2, '{"heldout":{"psnr":27}}')`,
      [org, j.id],
    );
  }
  return j.id;
}

const review = (user: string, id: string, decision: string, checklist: object, notes?: string) =>
  asUser(db, user, (tx) =>
    tx.query(`select public.review_processing_result($1, $2, $3, $4)`, [
      id,
      decision,
      JSON.stringify(checklist),
      notes ?? null,
    ]),
  );

beforeAll(async () => {
  db = await createTestDb();
  for (const k of ['owner', 'editor', 'outsider'] as const) u[k] = await createUser(db, `rev-${k}`);
  org = (
    await asUser(db, u.owner, (tx) =>
      one(
        tx.query<{ id: string }>(`select public.create_organization('Rev', $1) as id`, [
          slug('rev'),
        ]),
      ),
    )
  ).id;
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'editor')`,
    [org, u.editor],
  );
  apartment = await asUser(db, u.owner, async (tx) => {
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

describe('review_processing_result', () => {
  it('records an approval with the checklist, reviewer and time', async () => {
    const id = await job('succeeded');
    await review(
      u.owner,
      id,
      'approved',
      { floaters: true, holes: false },
      'Minor floaters in hallway',
    );
    const r = await one(
      db.query<{
        review_status: string;
        checklist: object;
        reviewed_by: string;
        review_notes: string;
      }>(
        `select review_status::text, checklist, reviewed_by, review_notes from public.processing_results where processing_job_id = $1`,
        [id],
      ),
    );
    expect(r).toEqual({
      review_status: 'approved',
      checklist: { floaters: true, holes: false },
      reviewed_by: u.owner,
      review_notes: 'Minor floaters in hallway',
    });
    const audited = await db.query(
      `select 1 from public.audit_logs where entity_type = 'processing_results' and action = 'update'`,
    );
    expect(audited.rows.length).toBeGreaterThan(0);
  });

  it('requires notes to reject and only known checklist items', async () => {
    const id = await job('succeeded');
    expect(await expectError(review(u.owner, id, 'rejected', {}))).toMatch(/NOTES_REQUIRED/);
    expect(await expectError(review(u.owner, id, 'approved', { hacked: true }))).toMatch(
      /VALIDATION_FAILED/,
    );
    expect(await expectError(review(u.owner, id, 'approved', { floaters: 'yes' }))).toMatch(
      /VALIDATION_FAILED/,
    );
    expect(await expectError(review(u.owner, id, 'pending_review', {}))).toMatch(
      /VALIDATION_FAILED/,
    );
  });

  it('only for finished jobs, members with scan.review, in their own organization', async () => {
    const running = await job('running');
    expect(await expectError(review(u.owner, running, 'approved', {}))).toMatch(/NOT_READY/);
    const id = await job('succeeded');
    expect(await expectError(review(u.editor, id, 'approved', {}))).toMatch(/NOT_FOUND/);
    expect(await expectError(review(u.outsider, id, 'approved', {}))).toMatch(/NOT_FOUND/);
  });

  it('members can read results but cannot write review fields directly', async () => {
    const id = await job('succeeded');
    const seen = await asUser(
      db,
      u.editor,
      async (tx) =>
        (
          await tx.query(`select 1 from public.processing_results where processing_job_id = $1`, [
            id,
          ])
        ).rows.length,
    );
    expect(seen).toBe(1);
    expect(
      await expectError(
        asUser(db, u.owner, (tx) =>
          tx.query(
            `update public.processing_results set review_status = 'approved' where processing_job_id = $1`,
            [id],
          ),
        ),
      ),
    ).toMatch(/permission denied/);
  });
});
