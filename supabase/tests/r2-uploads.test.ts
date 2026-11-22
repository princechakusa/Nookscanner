/** Stage 5.7: raw footage parts on R2, completed with Worker receipts (ADR-025). */
import { createHmac } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  asUser,
  createTestDb,
  createUser,
  dbTarget,
  expectError,
  slug,
  type TestDb,
} from './support/db.ts';

let db: TestDb;
const u = {} as Record<'owner' | 'manager' | 'viewer' | 'ownerB', string>;
let apartment: string;
const SECRET = 'r2-receipt-secret-for-tests-0123456789abcdef';
const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0]!;
const id = async (p: Promise<{ rows: { id: string }[] }>) => (await one(p)).id;
const receipt = (upload: string, part: number, size: number, path: string, key = SECRET) =>
  createHmac('sha256', key).update(`${upload}:${part}:${size}:${path}`).digest('hex');

beforeAll(async () => {
  db = await createTestDb();
  for (const k of ['owner', 'manager', 'viewer', 'ownerB'] as const)
    u[k] = await createUser(db, `r2-${k}`);
  const org = await asUser(db, u.owner, (tx) =>
    id(tx.query(`select public.create_organization('R2', $1) as id`, [slug('r2')])),
  );
  await asUser(db, u.ownerB, (tx) =>
    tx.query(`select public.create_organization('R2B', $1)`, [slug('r2b')]),
  );
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'manager'), ($1, $3, 'viewer')`,
    [org, u.manager, u.viewer],
  );
  const prop = await asUser(db, u.owner, (tx) =>
    id(
      tx.query(
        `insert into public.properties (organization_id, name) values ($1, 'P') returning id`,
        [org],
      ),
    ),
  );
  apartment = await asUser(db, u.owner, (tx) =>
    id(
      tx.query(`insert into public.apartments (property_id, name) values ($1, 'A') returning id`, [
        prop,
      ]),
    ),
  );
  await db.query(
    `insert into private.platform_secrets (name, value) values ('r2_receipt_secret', $1)
     on conflict (name) do update set value = excluded.value`,
    [SECRET],
  );
}, 120_000);

/** Registers a 2-part upload (45 MiB + 1000 bytes) under the given backend. */
/**
 * Registers a 2-part upload and sets its backend directly, as the platform: the global setting
 * is left alone because other test files share the local stack (a flip raced the dispatch test).
 */
async function upload(user: string, backend: 'supabase' | 'r2') {
  const r = await register(user);
  if (backend !== r.storage_backend) {
    await db.query(
      `alter table public.media_uploads disable trigger media_uploads_backend_immutable`,
    );
    await db.query(`update public.media_uploads set storage_backend = $1 where id = $2`, [
      backend,
      r.id,
    ]);
    await db.query(
      `alter table public.media_uploads enable trigger media_uploads_backend_immutable`,
    );
  }
  return { ...r, storage_backend: backend };
}
async function register(user: string) {
  return asUser(db, user, async (tx) => {
    const s = await id(
      tx.query(
        `insert into public.scan_sessions (apartment_id, method) values ($1, 'video_upload') returning id`,
        [apartment],
      ),
    );
    const size = 47_185_920 + 1000;
    const r = await one(
      tx.query<{ id: string; storage_backend: string }>(
        `select id, storage_backend from public.register_media_upload($1, 'walk.mp4', 'video/mp4', $2)`,
        [s, size],
      ),
    );
    return { ...r, session: s };
  });
}
const target = (user: string, upload: string, part: number) =>
  asUser(db, user, (tx) =>
    one(
      tx.query<{ object_path: string; size_bytes: number; status: string }>(
        `select * from public.r2_part_target($1, $2)`,
        [upload, part],
      ),
    ),
  );
const complete = (user: string, upload: string, part: number, r: string) =>
  asUser(
    db,
    user,
    async (tx) =>
      (
        await tx.query<{ n: number }>(
          `select public.complete_media_upload_part_r2($1, $2, $3) as n`,
          [upload, part, r],
        )
      ).rows[0]!.n,
  );

describe('R2 raw footage (5.7)', () => {
  it('HMAC-SHA256 in SQL matches Node for short, block-size and long keys', async () => {
    for (const key of ['Jefe', 'k'.repeat(64), 'x'.repeat(131)]) {
      const msg = 'upload:1:47185920:org/a/b.mp4';
      const sql = await one(
        db.query<{ h: string }>(`select private.hmac_sha256_hex($1, $2) as h`, [key, msg]),
      );
      expect(sql.h).toBe(createHmac('sha256', key).update(msg).digest('hex'));
    }
  });

  it('the backend comes from the platform setting at registration and never changes', async () => {
    if (dbTarget === 'pglite') {
      // Own database per file: safe to flip the global setting here.
      expect((await register(u.manager)).storage_backend).toBe('supabase');
      await db.query(
        `update private.platform_settings set value = 'r2' where key = 'raw_footage_backend'`,
      );
      expect((await register(u.manager)).storage_backend).toBe('r2');
      await db.query(
        `update private.platform_settings set value = 'supabase' where key = 'raw_footage_backend'`,
      );
    }
    const r2 = await upload(u.manager, 'r2');
    expect(r2.storage_backend).toBe('r2');
    expect(
      await expectError(
        db.query(`update public.media_uploads set storage_backend = 'supabase' where id = $1`, [
          r2.id,
        ]),
      ),
    ).toMatch(/IMMUTABLE_COLUMN/);
  });

  it('the uploader gets the server-built target; a valid receipt completes parts and the upload', async () => {
    const up = await upload(u.manager, 'r2');
    const p1 = await target(u.manager, up.id, 1);
    expect(p1).toMatchObject({ size_bytes: 47_185_920, status: 'pending' });
    expect(p1.object_path).toMatch(/^org\/.+\/apartments\/.+\.part0001$|part/);
    expect(
      await complete(u.manager, up.id, 1, receipt(up.id, 1, p1.size_bytes, p1.object_path)),
    ).toBe(1);
    // Idempotent: a repeated completion of a finished part is fine.
    expect(await complete(u.manager, up.id, 1, 'anything')).toBe(1);
    const p2 = await target(u.manager, up.id, 2);
    expect(p2.size_bytes).toBe(1000);
    expect(await complete(u.manager, up.id, 2, receipt(up.id, 2, 1000, p2.object_path))).toBe(0);
    const state = await one(
      db.query<{ u: string; s: string }>(
        `select mu.status::text as u, s.status::text as s from public.media_uploads mu join public.scan_sessions s on s.id = mu.scan_session_id where mu.id = $1`,
        [up.id],
      ),
    );
    expect(state).toEqual({ u: 'uploaded', s: 'uploaded' });
  });

  it('refuses forged, wrong-size, wrong-part and wrong-key receipts', async () => {
    const up = await upload(u.manager, 'r2');
    const p = await target(u.manager, up.id, 1);
    for (const bad of [
      'deadbeef',
      receipt(up.id, 1, p.size_bytes - 1, p.object_path),
      receipt(up.id, 2, p.size_bytes, p.object_path),
      receipt(up.id, 1, p.size_bytes, p.object_path, 'some-other-secret-0123456789abcdef'),
    ]) {
      expect(await expectError(complete(u.manager, up.id, 1, bad))).toMatch(/PART_INCOMPLETE/);
    }
  });

  it('only the uploader with scan.create sees targets; Supabase-backend uploads are not R2', async () => {
    const up = await upload(u.manager, 'r2');
    for (const user of [u.owner, u.viewer, u.ownerB]) {
      expect(await expectError(target(user, up.id, 1))).toMatch(/NOT_FOUND/);
    }
    const sb = await upload(u.manager, 'supabase');
    expect(await expectError(target(u.manager, sb.id, 1))).toMatch(/NOT_FOUND/);
    expect(await expectError(target(u.manager, up.id, 99))).toMatch(/NOT_FOUND/);
  });

  it('clients cannot read the receipt secret or the settings', async () => {
    for (const table of ['private.platform_secrets', 'private.platform_settings']) {
      expect(
        await expectError(asUser(db, u.owner, (tx) => tx.query(`select * from ${table}`))),
      ).toMatch(/permission denied/);
    }
  });
});
