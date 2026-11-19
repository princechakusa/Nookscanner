/**
 * Stage 2.6: regression tests for the Phase 2 backend security review findings F1-F5
 * (migration 20261120000300_security_hardening.sql; threats T25-T28).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, expectError, slug, type TestDb } from './support/db.ts';

let db: TestDb;
let owner: string;
let admin: string;
let manager: string;
let victim: string;
let ownerB: string;
let org: string;
let orgB: string;
let apartment: string;
let aptB: string;

async function first<T>(p: Promise<{ rows: T[] }>): Promise<T> {
  const { rows } = await p;
  if (!rows[0]) throw new Error('no row');
  return rows[0];
}

async function session(user: string, apt: string): Promise<string> {
  return (
    await asUser(db, user, (tx) =>
      first(
        tx.query<{ id: string }>(
          `insert into public.scan_sessions (apartment_id, method) values ($1, 'video_upload') returning id`,
          [apt],
        ),
      ),
    )
  ).id;
}

const register = (user: string, s: string) =>
  asUser(db, user, (tx) =>
    first(
      tx.query<{ id: string }>(
        `select id from public.register_media_upload($1, 'walk.mp4', 'video/mp4', 100)`,
        [s],
      ),
    ),
  );

beforeAll(async () => {
  db = await createTestDb();
  [owner, admin, manager, victim, ownerB] = (await Promise.all(
    ['sr-owner', 'sr-admin', 'sr-manager', 'sr-victim', 'sr-ownerb'].map((l) => createUser(db, l)),
  )) as [string, string, string, string, string];
  org = (
    await asUser(db, owner, (tx) =>
      first(
        tx.query<{ id: string }>(`select public.create_organization('SR', $1) as id`, [slug('sr')]),
      ),
    )
  ).id;
  orgB = (
    await asUser(db, ownerB, (tx) =>
      first(
        tx.query<{ id: string }>(`select public.create_organization('SRB', $1) as id`, [
          slug('srb'),
        ]),
      ),
    )
  ).id;
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'manager')`,
    [org, admin, manager],
  );
  apartment = await asUser(db, owner, async (tx) => {
    const prop = await first(
      tx.query<{ id: string }>(
        `insert into public.properties (organization_id, name) values ($1, 'P') returning id`,
        [org],
      ),
    );
    return (
      await first(
        tx.query<{ id: string }>(
          `insert into public.apartments (property_id, name) values ($1, 'A') returning id`,
          [prop.id],
        ),
      )
    ).id;
  });
  aptB = await asUser(db, ownerB, async (tx) => {
    const prop = await first(
      tx.query<{ id: string }>(
        `insert into public.properties (organization_id, name) values ($1, 'PB') returning id`,
        [orgB],
      ),
    );
    return (
      await first(
        tx.query<{ id: string }>(
          `insert into public.apartments (property_id, name) values ($1, 'AB') returning id`,
          [prop.id],
        ),
      )
    ).id;
  });
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe('F1: no membership without consent (T25)', () => {
  it('an admin cannot add an arbitrary user to the org, so cannot read their profile', async () => {
    const msg = await expectError(
      asUser(db, admin, (tx) =>
        tx.query(
          `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'viewer')`,
          [org, victim],
        ),
      ),
    );
    expect(msg).toMatch(/permission denied/);
    const seen = await asUser(
      db,
      admin,
      async (tx) =>
        (await tx.query(`select 1 from public.profiles where id = $1`, [victim])).rows.length,
    );
    expect(seen).toBe(0);
  });

  it('admins can still change roles and remove members', async () => {
    const affected = await asUser(
      db,
      admin,
      async (tx) =>
        (
          await tx.query(
            `update public.organization_members set role = 'editor' where organization_id = $1 and user_id = $2`,
            [org, manager],
          )
        ).affectedRows,
    );
    expect(affected).toBe(1);
    await db.query(
      `update public.organization_members set role = 'manager' where organization_id = $1 and user_id = $2`,
      [org, manager],
    );
  });
});

describe('F2/F3: immutable columns (T26)', () => {
  it('organizations.created_by cannot be changed; name can', async () => {
    const msg = await expectError(
      asUser(db, owner, (tx) =>
        tx.query(`update public.organizations set created_by = $1 where id = $2`, [admin, org]),
      ),
    );
    expect(msg).toMatch(/permission denied/);
    await asUser(db, owner, (tx) =>
      tx.query(`update public.organizations set name = 'SR 2' where id = $1`, [org]),
    );
  });

  it('apartments.public_id cannot be changed; name can', async () => {
    const msg = await expectError(
      asUser(db, owner, (tx) =>
        tx.query(`update public.apartments set public_id = 'aaaaaaaaaaaaaaaa' where id = $1`, [
          apartment,
        ]),
      ),
    );
    expect(msg).toMatch(/permission denied/);
    await asUser(db, manager, (tx) =>
      tx.query(`update public.apartments set name = 'A2' where id = $1`, [apartment]),
    );
  });
});

describe('F4: checkpoint uploads stay in their session (T27)', () => {
  it('rejects an upload id from another session', async () => {
    const s1 = await session(manager, apartment);
    const s2 = await session(manager, apartment);
    const upload = await register(manager, s2);
    const msg = await expectError(
      asUser(db, manager, (tx) =>
        tx.query(
          `insert into public.scan_checkpoints (scan_session_id, sequence, label_en, room_type, media_upload_id) values ($1, 0, 'Hall', 'hallway', $2)`,
          [s1, upload.id],
        ),
      ),
    );
    expect(msg).toMatch(/does not belong to this scan session/);
    await asUser(db, manager, (tx) =>
      tx.query(
        `insert into public.scan_checkpoints (scan_session_id, sequence, label_en, room_type, media_upload_id) values ($1, 0, 'Hall', 'hallway', $2)`,
        [s2, upload.id],
      ),
    );
  });

  it('rejects an upload id from another organization', async () => {
    const mine = await session(manager, apartment);
    const theirs = await register(ownerB, await session(ownerB, aptB));
    const msg = await expectError(
      asUser(db, manager, (tx) =>
        tx.query(
          `insert into public.scan_checkpoints (scan_session_id, sequence, label_en, room_type, media_upload_id) values ($1, 0, 'Hall', 'hallway', $2)`,
          [mine, theirs.id],
        ),
      ),
    );
    expect(msg).toMatch(/does not belong to this scan session/);
  });
});

describe('F5: upload registrations are capped per session (T12, T28)', () => {
  it('allows 20 and rejects the 21st', async () => {
    const s = await session(manager, apartment);
    for (let i = 0; i < 20; i += 1) await register(manager, s);
    const msg = await expectError(register(manager, s));
    expect(msg).toMatch(/UPLOAD_LIMIT_REACHED/);
  });
});
