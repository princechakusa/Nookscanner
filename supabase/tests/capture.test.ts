/**
 * Stage 2.2 + 2.3: invitations, QR codes, scan sessions/checkpoints, media uploads and storage
 * policies (threats T01-T04, T06, T07, T19 in docs/THREAT_MODEL.md).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  asAnon,
  asUser,
  createTestDb,
  createUser,
  expectError,
  slug,
  type TestDb,
} from './support/db.ts';

let db: TestDb;

const u = {} as Record<
  'ownerA' | 'adminA' | 'managerA' | 'editorA' | 'viewerA' | 'scopedA' | 'ownerB' | 'invitee',
  string
>;
let orgA: string;
let orgB: string;
let propA1: string;
let propA2: string;
let propB: string;
let aptA1: string;
let aptA2: string;
let aptB: string;
let roomA1: string;
let roomB: string;

async function one<T>(promise: Promise<{ rows: T[] }>): Promise<T> {
  const { rows } = await promise;
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`);
  return rows[0]!;
}

async function emailOf(userId: string): Promise<string> {
  return (
    await one(db.query<{ email: string }>(`select email from auth.users where id = $1`, [userId]))
  ).email;
}

async function newSession(user: string, apartment: string): Promise<string> {
  return (
    await asUser(db, user, (tx) =>
      one(
        tx.query<{ id: string }>(
          `insert into public.scan_sessions (apartment_id, method) values ($1, 'video_upload') returning id`,
          [apartment],
        ),
      ),
    )
  ).id;
}

async function registerUpload(user: string, session: string, mime = 'video/mp4', size = 1000) {
  return asUser(db, user, async (tx) => {
    const row = await one(
      tx.query<{
        id: string;
        object_path: string;
        organization_id: string;
        status: string;
        part_count: number;
      }>(
        `select id, object_path, organization_id, status::text, part_count from public.register_media_upload($1, 'walk.mp4', $2, $3)`,
        [session, mime, size],
      ),
    );
    const part = await one(
      tx.query<{ object_path: string }>(
        `select object_path from public.media_upload_parts where media_upload_id = $1 and part_number = 1`,
        [row.id],
      ),
    );
    return { ...row, part_path: part.object_path };
  });
}

/** Simulates Storage having stored a part object of the given size (service side). */
async function storePart(path: string, size: number) {
  // Real Supabase forbids direct deletes on storage tables, so update in place when present.
  const meta = JSON.stringify({ size, mimetype: 'video/mp4' });
  const updated = await db.query(
    `update storage.objects set metadata = $2 where bucket_id = 'raw-footage' and name = $1`,
    [path, meta],
  );
  if (updated.affectedRows === 0) {
    await db.query(
      `insert into storage.objects (bucket_id, name, metadata) values ('raw-footage', $1, $2)`,
      [path, meta],
    );
  }
}

beforeAll(async () => {
  db = await createTestDb();
  for (const key of [
    'ownerA',
    'adminA',
    'managerA',
    'editorA',
    'viewerA',
    'scopedA',
    'ownerB',
    'invitee',
  ] as const) {
    u[key] = await createUser(db, key);
  }
  const createOrg = (owner: string, name: string, base: string) =>
    asUser(db, owner, (tx) =>
      one(
        tx.query<{ id: string }>(`select public.create_organization($1, $2) as id`, [
          name,
          slug(base),
        ]),
      ),
    );
  orgA = (await createOrg(u.ownerA, 'Org A', 'cap-org-a')).id;
  orgB = (await createOrg(u.ownerB, 'Org B', 'cap-org-b')).id;

  const insertId = (tx: Parameters<Parameters<typeof asUser>[2]>[0], sql: string, p: unknown[]) =>
    one(tx.query<{ id: string }>(sql, p)).then((r) => r.id);

  // Memberships are created by accept_invitation in production; seeded here as the platform.
  for (const [user, role] of [
    [u.adminA, 'admin'],
    [u.managerA, 'manager'],
    [u.editorA, 'editor'],
    [u.viewerA, 'viewer'],
  ] as const) {
    await db.query(
      `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, $3)`,
      [orgA, user, role],
    );
  }
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role, scope) values ($1, $2, 'manager', 'properties')`,
    [orgA, u.scopedA],
  );
  await asUser(db, u.ownerA, async (tx) => {
    propA1 = await insertId(
      tx,
      `insert into public.properties (organization_id, name) values ($1, 'P1') returning id`,
      [orgA],
    );
    propA2 = await insertId(
      tx,
      `insert into public.properties (organization_id, name) values ($1, 'P2') returning id`,
      [orgA],
    );
    await tx.query(`insert into public.property_members (property_id, user_id) values ($1, $2)`, [
      propA1,
      u.scopedA,
    ]);
    aptA1 = await insertId(
      tx,
      `insert into public.apartments (property_id, name) values ($1, 'A1') returning id`,
      [propA1],
    );
    aptA2 = await insertId(
      tx,
      `insert into public.apartments (property_id, name) values ($1, 'A2') returning id`,
      [propA2],
    );
    roomA1 = await insertId(
      tx,
      `insert into public.rooms (apartment_id, name_en, room_type) values ($1, 'Living', 'living') returning id`,
      [aptA1],
    );
  });
  await asUser(db, u.ownerB, async (tx) => {
    propB = await insertId(
      tx,
      `insert into public.properties (organization_id, name) values ($1, 'PB') returning id`,
      [orgB],
    );
    aptB = await insertId(
      tx,
      `insert into public.apartments (property_id, name) values ($1, 'B1') returning id`,
      [propB],
    );
    roomB = await insertId(
      tx,
      `insert into public.rooms (apartment_id, name_en, room_type) values ($1, 'Kitchen', 'kitchen') returning id`,
      [aptB],
    );
  });
});

afterAll(async () => {
  await db?.close();
});

describe('invitations', () => {
  it('admin creates an invitation; only the token hash is stored and audited', async () => {
    const email = await emailOf(u.invitee);
    const inv = await asUser(db, u.adminA, (tx) =>
      one(
        tx.query<{ invitation_id: string; token: string }>(
          `select * from public.create_invitation($1, $2, 'editor')`,
          [orgA, email.toUpperCase()],
        ),
      ),
    );
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = await one(
      db.query<{ token_hash: string; email: string }>(
        `select token_hash, email from public.organization_invitations where id = $1`,
        [inv.invitation_id],
      ),
    );
    expect(stored.email).toBe(email);
    expect(stored.token_hash).not.toContain(inv.token);
    const leaked = await db.query(
      `select 1 from public.audit_logs where old_data::text like $1 or new_data::text like $1 or new_data ? 'token_hash'`,
      [`%${inv.token}%`],
    );
    expect(leaked.rows).toEqual([]);

    // Wrong user cannot accept; the invitee can, exactly once.
    const wrong = await expectError(
      asUser(db, u.ownerB, (tx) => tx.query(`select public.accept_invitation($1)`, [inv.token])),
    );
    expect(wrong).toMatch(/FORBIDDEN/);
    const org = await asUser(db, u.invitee, (tx) =>
      one(tx.query<{ org: string }>(`select public.accept_invitation($1) as org`, [inv.token])),
    );
    expect(org.org).toBe(orgA);
    const role = await one(
      db.query<{ role: string }>(
        `select role::text from public.organization_members where organization_id = $1 and user_id = $2`,
        [orgA, u.invitee],
      ),
    );
    expect(role.role).toBe('editor');
    const again = await expectError(
      asUser(db, u.invitee, (tx) => tx.query(`select public.accept_invitation($1)`, [inv.token])),
    );
    expect(again).toMatch(/NOT_FOUND/);
  });

  it('rejects unknown, malformed and expired tokens with a uniform NOT_FOUND', async () => {
    for (const token of ['x', 'A'.repeat(43), "'; drop table x; --"]) {
      const msg = await expectError(
        asUser(db, u.invitee, (tx) => tx.query(`select public.accept_invitation($1)`, [token])),
      );
      expect(msg).toMatch(/NOT_FOUND/);
    }
    const target = await createUser(db, 'expiring');
    const targetEmail = await emailOf(target);
    const inv = await asUser(db, u.ownerA, async (tx) =>
      one(
        tx.query<{ invitation_id: string; token: string }>(
          `select * from public.create_invitation($1, $2, 'viewer')`,
          [orgA, targetEmail],
        ),
      ),
    );
    await db.query(
      `update public.organization_invitations set expires_at = now() - interval '1 minute' where id = $1`,
      [inv.invitation_id],
    );
    const msg = await expectError(
      asUser(db, target, (tx) => tx.query(`select public.accept_invitation($1)`, [inv.token])),
    );
    expect(msg).toMatch(/NOT_FOUND/);
  });

  it('managers cannot invite; nobody can invite an owner or into another org', async () => {
    const manager = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(`select * from public.create_invitation($1, 'new@example.test', 'viewer')`, [
          orgA,
        ]),
      ),
    );
    expect(manager).toMatch(/FORBIDDEN/);
    const owner = await expectError(
      asUser(db, u.ownerA, (tx) =>
        tx.query(`select * from public.create_invitation($1, 'new@example.test', 'owner')`, [orgA]),
      ),
    );
    expect(owner).toMatch(/OWNER_ROLE_REQUIRED/);
    const cross = await expectError(
      asUser(db, u.ownerB, (tx) =>
        tx.query(`select * from public.create_invitation($1, 'new@example.test', 'viewer')`, [
          orgA,
        ]),
      ),
    );
    expect(cross).toMatch(/FORBIDDEN/);
  });

  it('property-scoped invitations only accept properties of the same org and assign them', async () => {
    const cross = await expectError(
      asUser(db, u.ownerA, (tx) =>
        tx.query(
          `select * from public.create_invitation($1, 'scoped@example.test', 'viewer', 'properties', array[$2]::uuid[])`,
          [orgA, propB],
        ),
      ),
    );
    expect(cross).toMatch(/FORBIDDEN/);
    const target = await createUser(db, 'scopedinvitee');
    const targetEmail = await emailOf(target);
    const inv = await asUser(db, u.ownerA, async (tx) =>
      one(
        tx.query<{ token: string }>(
          `select * from public.create_invitation($1, $2, 'viewer', 'properties', array[$3]::uuid[])`,
          [orgA, targetEmail, propA2],
        ),
      ),
    );
    await asUser(db, target, (tx) => tx.query(`select public.accept_invitation($1)`, [inv.token]));
    const props = await asUser(db, target, async (tx) =>
      (await tx.query<{ id: string }>(`select id from public.properties`)).rows.map((r) => r.id),
    );
    expect(props).toEqual([propA2]);
  });

  it('invitations are invisible to other orgs and to non-managers; no direct writes', async () => {
    const seen = await asUser(
      db,
      u.ownerB,
      async (tx) =>
        (
          await tx.query(
            `select 1 from public.organization_invitations where organization_id = $1`,
            [orgA],
          )
        ).rows.length,
    );
    expect(seen).toBe(0);
    const editor = await asUser(
      db,
      u.editorA,
      async (tx) => (await tx.query(`select 1 from public.organization_invitations`)).rows.length,
    );
    expect(editor).toBe(0);
    const direct = await expectError(
      asUser(db, u.ownerA, (tx) =>
        tx.query(
          `insert into public.organization_invitations (organization_id, email, role, token_hash) values ($1, 'x@example.test', 'admin', repeat('a', 64))`,
          [orgA],
        ),
      ),
    );
    expect(direct).toMatch(/permission denied/);
  });

  it('revoked invitations cannot be accepted', async () => {
    const target = await createUser(db, 'revoked');
    const targetEmail = await emailOf(target);
    const inv = await asUser(db, u.ownerA, async (tx) =>
      one(
        tx.query<{ invitation_id: string; token: string }>(
          `select * from public.create_invitation($1, $2, 'viewer')`,
          [orgA, targetEmail],
        ),
      ),
    );
    await asUser(db, u.adminA, (tx) =>
      tx.query(`select public.revoke_invitation($1)`, [inv.invitation_id]),
    );
    const msg = await expectError(
      asUser(db, target, (tx) => tx.query(`select public.accept_invitation($1)`, [inv.token])),
    );
    expect(msg).toMatch(/NOT_FOUND/);
  });
});

describe('qr codes', () => {
  it('manager creates a high-entropy unique token; tokens never reach the audit log', async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const qr = await asUser(db, u.managerA, (tx) =>
        one(
          tx.query<{ token: string }>(`select token from public.create_qr_code($1, 'Door')`, [
            aptA1,
          ]),
        ),
      );
      expect(qr.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      tokens.add(qr.token);
    }
    expect(tokens.size).toBe(50);
    const leaked = await db.query(
      `select 1 from public.audit_logs where entity_type = 'qr_codes' and (new_data ? 'token' or old_data ? 'token')`,
    );
    expect(leaked.rows).toEqual([]);
  });

  it('editors, viewers and other orgs cannot create or read QR codes', async () => {
    for (const user of [u.editorA, u.viewerA, u.ownerB]) {
      const msg = await expectError(
        asUser(db, user, (tx) => tx.query(`select public.create_qr_code($1)`, [aptA1])),
      );
      expect(msg).toMatch(/NOT_FOUND/);
      const n = await asUser(
        db,
        user,
        async (tx) =>
          (await tx.query(`select 1 from public.qr_codes where apartment_id = $1`, [aptA1])).rows
            .length,
      );
      expect(n).toBe(0);
    }
  });

  it('tokens cannot be set or changed by clients; revoke works and is permanent', async () => {
    const direct = await expectError(
      asUser(db, u.ownerA, (tx) =>
        tx.query(`insert into public.qr_codes (apartment_id, token) values ($1, $2)`, [
          aptA1,
          'a'.repeat(43),
        ]),
      ),
    );
    expect(direct).toMatch(/permission denied/);
    const qr = await asUser(db, u.managerA, (tx) =>
      one(tx.query<{ id: string }>(`select id from public.create_qr_code($1)`, [aptA1])),
    );
    const change = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(`update public.qr_codes set token = $1 where id = $2`, ['b'.repeat(43), qr.id]),
      ),
    );
    expect(change).toMatch(/permission denied/);
    await asUser(db, u.managerA, (tx) => tx.query(`select public.revoke_qr_code($1)`, [qr.id]));
    const row = await one(
      db.query<{ status: string; revoked_by: string }>(
        `select status::text, revoked_by from public.qr_codes where id = $1`,
        [qr.id],
      ),
    );
    expect(row).toEqual({ status: 'revoked', revoked_by: u.managerA });
    const reactivate = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(`update public.qr_codes set status = 'active' where id = $1`, [qr.id]),
      ),
    );
    expect(reactivate).toMatch(/permission denied/);
  });

  it('a property-scoped manager cannot manage QR codes of unassigned properties', async () => {
    const msg = await expectError(
      asUser(db, u.scopedA, (tx) => tx.query(`select public.create_qr_code($1)`, [aptA2])),
    );
    expect(msg).toMatch(/NOT_FOUND/);
    await asUser(db, u.scopedA, (tx) => tx.query(`select public.create_qr_code($1)`, [aptA1]));
  });

  it('anon has no access', async () => {
    const msg = await expectError(asAnon(db, (tx) => tx.query(`select * from public.qr_codes`)));
    expect(msg).toMatch(/permission denied/);
    const rpc = await expectError(
      asAnon(db, (tx) => tx.query(`select public.create_qr_code($1)`, [aptA1])),
    );
    expect(rpc).toMatch(/permission denied/);
  });
});

describe('scan sessions and checkpoints', () => {
  it('manager creates a session; editor and viewer cannot', async () => {
    const id = await newSession(u.managerA, aptA1);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    for (const user of [u.editorA, u.viewerA, u.ownerB]) {
      const msg = await expectError(newSession(user, aptA1));
      expect(msg).toMatch(/row-level security/);
    }
  });

  it('viewer reads sessions of own org; other org sees none', async () => {
    await newSession(u.managerA, aptA1);
    const viewer = await asUser(
      db,
      u.viewerA,
      async (tx) => (await tx.query(`select 1 from public.scan_sessions`)).rows.length,
    );
    expect(viewer).toBeGreaterThan(0);
    const other = await asUser(
      db,
      u.ownerB,
      async (tx) =>
        (await tx.query(`select 1 from public.scan_sessions where organization_id = $1`, [orgA]))
          .rows.length,
    );
    expect(other).toBe(0);
  });

  it('members cannot set processing states, re-parent a session or store location data', async () => {
    const id = await newSession(u.managerA, aptA1);
    const processing = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(`update public.scan_sessions set status = 'succeeded' where id = $1`, [id]),
      ),
    );
    expect(processing).toMatch(/row-level security/);
    const reparent = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(`update public.scan_sessions set apartment_id = $1 where id = $2`, [aptA2, id]),
      ),
    );
    expect(reparent).toMatch(/IMMUTABLE_COLUMN/);
    const location = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(
          `insert into public.scan_sessions (apartment_id, method, device_info) values ($1, 'guided_capture', '{"latitude": 25.1}')`,
          [aptA1],
        ),
      ),
    );
    expect(location).toMatch(/check constraint/);
    const spoofCreator = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(
          `insert into public.scan_sessions (apartment_id, method, created_by) values ($1, 'video_upload', $2)`,
          [aptA1, u.ownerA],
        ),
      ),
    );
    expect(spoofCreator).toMatch(/row-level security/);
  });

  it('checkpoints must reference a room of the same apartment', async () => {
    const id = await newSession(u.managerA, aptA1);
    await asUser(db, u.managerA, (tx) =>
      tx.query(
        `insert into public.scan_checkpoints (scan_session_id, sequence, label_en, room_type, room_id) values ($1, 0, 'Living', 'living', $2)`,
        [id, roomA1],
      ),
    );
    const cross = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(
          `insert into public.scan_checkpoints (scan_session_id, sequence, label_en, room_type, room_id) values ($1, 1, 'Kitchen', 'kitchen', $2)`,
          [id, roomB],
        ),
      ),
    );
    expect(cross).toMatch(/room does not belong/);
    const otherOrg = await expectError(
      asUser(db, u.ownerB, (tx) =>
        tx.query(
          `insert into public.scan_checkpoints (scan_session_id, sequence, label_en, room_type) values ($1, 2, 'X', 'other')`,
          [id],
        ),
      ),
    );
    expect(otherOrg).toMatch(/row-level security/);
  });
});

describe('media uploads', () => {
  it('register builds the server-side path and moves the session to uploading', async () => {
    const session = await newSession(u.managerA, aptA1);
    const up = await registerUpload(u.managerA, session);
    expect(up.object_path).toBe(`org/${orgA}/scans/${session}/${up.id}.mp4`);
    expect(up.part_path).toBe(`org/${orgA}/scans/${session}/${up.id}/part-00001.mp4`);
    expect(up.status).toBe('pending');
    const s = await one(
      db.query<{ status: string }>(`select status::text from public.scan_sessions where id = $1`, [
        session,
      ]),
    );
    expect(s.status).toBe('uploading');
  });

  it('rejects disallowed types, empty and oversized files', async () => {
    const session = await newSession(u.managerA, aptA1);
    expect(
      await expectError(registerUpload(u.managerA, session, 'application/x-msdownload')),
    ).toMatch(/UPLOAD_REJECTED/);
    expect(await expectError(registerUpload(u.managerA, session, 'video/mp4', 0))).toMatch(
      /UPLOAD_REJECTED/,
    );
    expect(
      await expectError(registerUpload(u.managerA, session, 'video/mp4', 10737418241)),
    ).toMatch(/UPLOAD_REJECTED/);
  });

  it('splits uploads into parts of at most 45 MiB with server-built paths (ADR-016)', async () => {
    const session = await newSession(u.managerA, aptA1);
    const part = 47185920;
    const size = 2 * part + 1234;
    const up = await registerUpload(u.managerA, session, 'video/quicktime', size);
    expect(up.part_count).toBe(3);
    const parts = await asUser(
      db,
      u.viewerA,
      async (tx) =>
        (
          await tx.query<{
            part_number: number;
            object_path: string;
            size_bytes: number;
            status: string;
          }>(
            `select part_number, object_path, size_bytes, status::text from public.media_upload_parts
           where media_upload_id = $1 order by part_number`,
            [up.id],
          )
        ).rows,
    );
    const prefix = `org/${orgA}/scans/${session}/${up.id}`;
    expect(parts).toEqual([
      {
        part_number: 1,
        object_path: `${prefix}/part-00001.mov`,
        size_bytes: part,
        status: 'pending',
      },
      {
        part_number: 2,
        object_path: `${prefix}/part-00002.mov`,
        size_bytes: part,
        status: 'pending',
      },
      {
        part_number: 3,
        object_path: `${prefix}/part-00003.mov`,
        size_bytes: 1234,
        status: 'pending',
      },
    ]);
    // 10 GiB is 228 parts.
    const big = await registerUpload(u.managerA, session, 'video/mp4', 10737418240);
    expect(big.part_count).toBe(228);
    // Parts are visible to the session's readers only, and never writable directly.
    const other = await asUser(
      db,
      u.ownerB,
      async (tx) =>
        (
          await tx.query(`select 1 from public.media_upload_parts where media_upload_id = $1`, [
            up.id,
          ])
        ).rows.length,
    );
    expect(other).toBe(0);
    const direct = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(
          `update public.media_upload_parts set status = 'uploaded' where media_upload_id = $1`,
          [up.id],
        ),
      ),
    );
    expect(direct).toMatch(/permission denied/);
  });

  it('a part completes only when its object exists with the exact size; last part completes the upload', async () => {
    const session = await newSession(u.managerA, aptA1);
    const up = await registerUpload(u.managerA, session, 'video/mp4', 47185920 + 10);
    const complete = (user: string, n: number) =>
      asUser(db, user, (tx) =>
        one(
          tx.query<{ remaining: number }>(
            `select public.complete_media_upload_part($1, $2) as remaining`,
            [up.id, n],
          ),
        ),
      );
    const part2 = up.part_path.replace('part-00001', 'part-00002');
    // Missing object, then wrong size.
    expect(await expectError(complete(u.managerA, 1))).toMatch(/PART_INCOMPLETE/);
    await storePart(up.part_path, 100);
    expect(await expectError(complete(u.managerA, 1))).toMatch(/PART_INCOMPLETE/);
    await storePart(up.part_path, 47185920);
    // Only the uploader may complete parts; others get NOT_FOUND.
    for (const user of [u.adminA, u.ownerB, u.viewerA]) {
      expect(await expectError(complete(user, 1))).toMatch(/NOT_FOUND/);
    }
    expect(await expectError(complete(u.managerA, 3))).toMatch(/NOT_FOUND/);
    expect((await complete(u.managerA, 1)).remaining).toBe(1);
    expect((await complete(u.managerA, 1)).remaining).toBe(1); // idempotent
    await storePart(part2, 10);
    expect((await complete(u.managerA, 2)).remaining).toBe(0);
    const state = await one(
      db.query<{ upload: string; session: string }>(
        `select mu.status::text as upload, s.status::text as session
         from public.media_uploads mu join public.scan_sessions s on s.id = mu.scan_session_id
         where mu.id = $1`,
        [up.id],
      ),
    );
    expect(state).toEqual({ upload: 'uploaded', session: 'uploaded' });
    // Completed parts can no longer be written (the policy needs a pending part and upload).
    const allowed = await asUser(
      db,
      u.managerA,
      async (tx) =>
        (
          await tx.query<{ ok: boolean }>(`select private.can_upload_raw_footage($1) as ok`, [
            part2,
          ])
        ).rows[0]!.ok,
    );
    expect(allowed).toBe(false);
  });

  it('other orgs, viewers and editors cannot register uploads; no direct inserts', async () => {
    const session = await newSession(u.managerA, aptA1);
    for (const user of [u.ownerB, u.viewerA, u.editorA]) {
      expect(await expectError(registerUpload(user, session))).toMatch(/NOT_FOUND/);
    }
    const direct = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(
          `insert into public.media_uploads (scan_session_id, object_path, original_filename, mime_type, size_bytes) values ($1, 'org/x', 'a.mp4', 'video/mp4', 1)`,
          [session],
        ),
      ),
    );
    expect(direct).toMatch(/permission denied/);
  });
});

describe('storage policies (T06, T07)', () => {
  const putObject = (user: string, bucket: string, name: string) =>
    asUser(db, user, (tx) =>
      tx.query(`insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)`, [
        bucket,
        name,
        user,
      ]),
    );

  it('creates the five buckets with only published-assets public', async () => {
    const { rows } = await db.query<{ id: string; public: boolean }>(
      `select id, public from storage.buckets order by id`,
    );
    expect(rows).toEqual([
      { id: 'instruction-media', public: false },
      { id: 'published-assets', public: true },
      { id: 'raw-footage', public: false },
      { id: 'scene-drafts', public: false },
      { id: 'scene-masters', public: false },
    ]);
  });

  it('raw footage: registered path by its creator allowed; anything else denied', async () => {
    const session = await newSession(u.managerA, aptA1);
    const up = await registerUpload(u.managerA, session);
    // Another member of the same org may not use someone else's upload slot.
    expect(await expectError(putObject(u.adminA, 'raw-footage', up.part_path))).toMatch(
      /row-level security/,
    );
    // Other org denied, unregistered path denied.
    expect(await expectError(putObject(u.ownerB, 'raw-footage', up.part_path))).toMatch(
      /row-level security/,
    );
    expect(
      await expectError(
        putObject(u.managerA, 'raw-footage', `org/${orgA}/scans/${session}/rogue.mp4`),
      ),
    ).toMatch(/row-level security/);
    // The logical path is not an object any more: only parts are accepted.
    expect(await expectError(putObject(u.managerA, 'raw-footage', up.object_path))).toMatch(
      /row-level security/,
    );
    await putObject(u.managerA, 'raw-footage', up.part_path);

    const readable = async (user: string) =>
      asUser(
        db,
        user,
        async (tx) =>
          (
            await tx.query(
              `select 1 from storage.objects where bucket_id = 'raw-footage' and name = $1`,
              [up.part_path],
            )
          ).rows.length,
      );
    expect(await readable(u.viewerA)).toBe(1);
    expect(await readable(u.ownerB)).toBe(0);
    const anon = await asAnon(
      db,
      async (tx) =>
        (await tx.query(`select 1 from storage.objects where bucket_id = 'raw-footage'`)).rows
          .length,
    );
    expect(anon).toBe(0);
  });

  it('raw footage cannot be deleted or overwritten by members', async () => {
    const session = await newSession(u.managerA, aptA1);
    const up = await registerUpload(u.managerA, session);
    await putObject(u.managerA, 'raw-footage', up.part_path);
    // Real Supabase additionally rejects direct SQL deletes on storage tables; the shim relies on
    // RLS alone (0 rows). Either outcome is a denial; the object must survive.
    const attempt = (sql: string) =>
      asUser(db, u.ownerA, (tx) => tx.query(sql, [up.part_path])).then(
        (r) => r.affectedRows ?? 0,
        () => 0,
      );
    expect(await attempt(`delete from storage.objects where name = $1`)).toBe(0);
    expect(await attempt(`update storage.objects set name = name || 'x' where name = $1`)).toBe(0);
    const still = await db.query(`select 1 from storage.objects where name = $1`, [up.part_path]);
    expect(still.rows.length).toBe(1);
  });

  it('instruction media: editor of the org may write; viewer, other org and path tricks denied', async () => {
    const good = `org/${orgA}/apartments/${aptA1}/instructions/ac.jpg`;
    await putObject(u.editorA, 'instruction-media', good);
    expect(await expectError(putObject(u.viewerA, 'instruction-media', `${good}.2`))).toMatch(
      /row-level security/,
    );
    expect(await expectError(putObject(u.ownerB, 'instruction-media', `${good}.3`))).toMatch(
      /row-level security/,
    );
    // Org in path does not match the apartment's org.
    expect(
      await expectError(
        putObject(u.ownerB, 'instruction-media', `org/${orgB}/apartments/${aptA1}/x.jpg`),
      ),
    ).toMatch(/row-level security/);
    // Own org prefix with another org's apartment.
    expect(
      await expectError(
        putObject(u.ownerB, 'instruction-media', `org/${orgA}/apartments/${aptB}/x.jpg`),
      ),
    ).toMatch(/row-level security/);
    expect(
      await expectError(
        putObject(u.editorA, 'instruction-media', `org/${orgA}/apartments/../${aptA1}/x.jpg`),
      ),
    ).toMatch(/row-level security/);
  });

  it('scene masters, drafts and published assets cannot be written by members', async () => {
    for (const bucket of ['scene-masters', 'scene-drafts', 'published-assets']) {
      expect(
        await expectError(putObject(u.ownerA, bucket, `org/${orgA}/apartments/${aptA1}/scene.sog`)),
      ).toMatch(/row-level security/);
    }
  });

  it('scene drafts are readable by the org (scan.read) only', async () => {
    const name = `org/${orgA}/apartments/${aptA1}/scenes/v1/preview.webp`;
    await db.query(`insert into storage.objects (bucket_id, name) values ('scene-drafts', $1)`, [
      name,
    ]);
    const count = (user: string) =>
      asUser(
        db,
        user,
        async (tx) =>
          (
            await tx.query(
              `select 1 from storage.objects where bucket_id = 'scene-drafts' and name = $1`,
              [name],
            )
          ).rows.length,
      );
    expect(await count(u.viewerA)).toBe(1);
    expect(await count(u.ownerB)).toBe(0);
    expect(await count(u.scopedA)).toBe(1);
  });
});
