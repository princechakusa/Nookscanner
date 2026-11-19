/**
 * Tenant isolation and permission-boundary tests (docs/TESTING_STRATEGY.md section 2,
 * threats T01-T05, T19 in docs/THREAT_MODEL.md).
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

// Org A: owner, admin, manager, editor, viewer, a property-scoped manager. Org B: owner.
const u = {} as Record<
  'ownerA' | 'adminA' | 'managerA' | 'editorA' | 'viewerA' | 'scopedA' | 'ownerB' | 'outsider',
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

async function one<T>(promise: Promise<{ rows: T[] }>): Promise<T> {
  const { rows } = await promise;
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`);
  return rows[0]!;
}

beforeAll(async () => {
  db = await createTestDb();
  for (const key of Object.keys({
    ownerA: 0,
    adminA: 0,
    managerA: 0,
    editorA: 0,
    viewerA: 0,
    scopedA: 0,
    ownerB: 0,
    outsider: 0,
  }) as Array<keyof typeof u>) {
    u[key] = await createUser(db, key);
  }

  orgA = (
    await asUser(db, u.ownerA, (tx) =>
      one(
        tx.query<{ id: string }>(
          `select public.create_organization('Org A', '${slug('org-a')}') as id`,
        ),
      ),
    )
  ).id;
  orgB = (
    await asUser(db, u.ownerB, (tx) =>
      one(
        tx.query<{ id: string }>(
          `select public.create_organization('Org B', '${slug('org-b')}') as id`,
        ),
      ),
    )
  ).id;

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
    propA1 = (
      await one(
        tx.query<{ id: string }>(
          `insert into public.properties (organization_id, name) values ($1, 'Marina Tower') returning id`,
          [orgA],
        ),
      )
    ).id;
    propA2 = (
      await one(
        tx.query<{ id: string }>(
          `insert into public.properties (organization_id, name) values ($1, 'Palm Court') returning id`,
          [orgA],
        ),
      )
    ).id;
    await tx.query(`insert into public.property_members (property_id, user_id) values ($1, $2)`, [
      propA1,
      u.scopedA,
    ]);
    aptA1 = (
      await one(
        tx.query<{ id: string }>(
          `insert into public.apartments (property_id, name) values ($1, 'Unit 1201') returning id`,
          [propA1],
        ),
      )
    ).id;
    aptA2 = (
      await one(
        tx.query<{ id: string }>(
          `insert into public.apartments (property_id, name) values ($1, 'Unit 7') returning id`,
          [propA2],
        ),
      )
    ).id;
  });

  await asUser(db, u.ownerB, async (tx) => {
    propB = (
      await one(
        tx.query<{ id: string }>(
          `insert into public.properties (organization_id, name) values ($1, 'B Residences') returning id`,
          [orgB],
        ),
      )
    ).id;
    aptB = (
      await one(
        tx.query<{ id: string }>(
          `insert into public.apartments (property_id, name) values ($1, 'B-1') returning id`,
          [propB],
        ),
      )
    ).id;
  });
});

afterAll(async () => {
  await db?.close();
});

describe('organization bootstrap', () => {
  it('makes the creator the owner', async () => {
    const row = await asUser(db, u.ownerA, (tx) =>
      one(
        tx.query<{ role: string }>(
          `select role::text from public.organization_members where organization_id = $1 and user_id = $2`,
          [orgA, u.ownerA],
        ),
      ),
    );
    expect(row.role).toBe('owner');
  });

  it('forbids direct inserts into organizations (must use the RPC)', async () => {
    const msg = await expectError(
      asUser(db, u.outsider, (tx) =>
        tx.query(`insert into public.organizations (name, slug) values ('X', 'x-org')`),
      ),
    );
    expect(msg).toMatch(/permission denied|row-level security/);
  });

  it('rejects invalid slugs', async () => {
    const msg = await expectError(
      asUser(db, u.outsider, (tx) =>
        tx.query(`select public.create_organization('Bad', '${slug('Bad Slug!')}')`),
      ),
    );
    expect(msg).toMatch(/check constraint/);
  });
});

describe('tenant isolation (T01)', () => {
  it('org B owner cannot see org A rows in any tenant table', async () => {
    const counts = await asUser(db, u.ownerB, async (tx) => {
      const q = async (sql: string) =>
        (await one(tx.query<{ n: number }>(`select count(*)::int as n from ${sql}`))).n;
      return {
        orgs: await q(`public.organizations where id = '${orgA}'`),
        members: await q(`public.organization_members where organization_id = '${orgA}'`),
        properties: await q(`public.properties where organization_id = '${orgA}'`),
        apartments: await q(`public.apartments where organization_id = '${orgA}'`),
        audit: await q(`public.audit_logs where organization_id = '${orgA}'`),
      };
    });
    expect(counts).toEqual({ orgs: 0, members: 0, properties: 0, apartments: 0, audit: 0 });
  });

  it('org B owner cannot update or delete org A rows (silently affects 0 rows)', async () => {
    const affected = await asUser(db, u.ownerB, async (tx) => {
      const upd = await tx.query(`update public.apartments set name = 'pwned' where id = $1`, [
        aptA1,
      ]);
      const del = await tx.query(`delete from public.properties where id = $1`, [propA1]);
      return [upd.affectedRows, del.affectedRows];
    });
    expect(affected).toEqual([0, 0]);
  });

  it('cannot insert an apartment into another org property', async () => {
    const msg = await expectError(
      asUser(db, u.ownerB, (tx) =>
        tx.query(`insert into public.apartments (property_id, name) values ($1, 'intruder')`, [
          propA1,
        ]),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it('cannot attach a room in own org to another org apartment via organization_id spoofing (T03)', async () => {
    const msg = await expectError(
      asUser(db, u.ownerB, (tx) =>
        tx.query(
          `insert into public.rooms (organization_id, apartment_id, name_en, room_type) values ($1, $2, 'Hall', 'hallway')`,
          [orgB, aptA1],
        ),
      ),
    );
    expect(msg).toMatch(/organization mismatch|row-level security/);
  });

  it('cannot add oneself to another organization', async () => {
    const msg = await expectError(
      asUser(db, u.outsider, (tx) =>
        tx.query(
          `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'viewer')`,
          [orgA, u.outsider],
        ),
      ),
    );
    expect(msg).toMatch(/row-level security|permission denied/);
  });

  it('cannot move a property to another organization', async () => {
    const msg = await expectError(
      asUser(db, u.ownerA, (tx) =>
        tx.query(`update public.properties set organization_id = $1 where id = $2`, [orgB, propA1]),
      ),
    );
    expect(msg).toMatch(/cannot be changed|row-level security|permission denied/);
  });
});

describe('role boundaries', () => {
  it('viewer can read but not write', async () => {
    const n = await asUser(
      db,
      u.viewerA,
      async (tx) =>
        (await one(tx.query<{ n: number }>(`select count(*)::int as n from public.apartments`))).n,
    );
    expect(n).toBe(2);
    const affected = await asUser(
      db,
      u.viewerA,
      async (tx) =>
        (await tx.query(`update public.apartments set name = 'x' where id = $1`, [aptA1]))
          .affectedRows,
    );
    expect(affected).toBe(0);
  });

  it('editor can write rooms but cannot create apartments', async () => {
    await asUser(db, u.editorA, (tx) =>
      tx.query(
        `insert into public.rooms (apartment_id, name_en, room_type) values ($1, 'Kitchen', 'kitchen')`,
        [aptA1],
      ),
    );
    const msg = await expectError(
      asUser(db, u.editorA, (tx) =>
        tx.query(`insert into public.apartments (property_id, name) values ($1, 'New')`, [propA1]),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it('manager can create apartments but cannot create properties or manage members', async () => {
    await asUser(db, u.managerA, (tx) =>
      tx.query(`insert into public.apartments (property_id, name) values ($1, 'Unit 1202')`, [
        propA1,
      ]),
    );
    const prop = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(`insert into public.properties (organization_id, name) values ($1, 'Nope')`, [
          orgA,
        ]),
      ),
    );
    expect(prop).toMatch(/row-level security/);
    const member = await expectError(
      asUser(db, u.managerA, (tx) =>
        tx.query(
          `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'viewer')`,
          [orgA, u.outsider],
        ),
      ),
    );
    expect(member).toMatch(/row-level security|permission denied/);
  });

  it('nobody can publish by setting status directly', async () => {
    const msg = await expectError(
      asUser(db, u.ownerA, (tx) =>
        tx.query(`update public.apartments set status = 'published' where id = $1`, [aptA1]),
      ),
    );
    expect(msg).toMatch(/publish_apartment/);
  });
});

describe('property-scoped members', () => {
  it('see only assigned properties and their apartments', async () => {
    const seen = await asUser(db, u.scopedA, async (tx) => ({
      properties: (await tx.query<{ id: string }>(`select id from public.properties`)).rows.map(
        (r) => r.id,
      ),
      apartments: (
        await tx.query<{ id: string }>(
          `select id from public.apartments where property_id = $1 or property_id = $2`,
          [propA1, propA2],
        )
      ).rows.map((r) => r.id),
    }));
    expect(seen.properties).toEqual([propA1]);
    expect(seen.apartments).not.toContain(aptA2);
    expect(seen.apartments).toContain(aptA1);
  });

  it('cannot create apartments in an unassigned property', async () => {
    const msg = await expectError(
      asUser(db, u.scopedA, (tx) =>
        tx.query(`insert into public.apartments (property_id, name) values ($1, 'Sneaky')`, [
          propA2,
        ]),
      ),
    );
    expect(msg).toMatch(/row-level security/);
  });

  it('cannot be given an admin role while scoped', async () => {
    const msg = await expectError(
      asUser(db, u.ownerA, (tx) =>
        tx.query(
          `update public.organization_members set role = 'admin' where organization_id = $1 and user_id = $2`,
          [orgA, u.scopedA],
        ),
      ),
    );
    expect(msg).toMatch(/organization_members_scoped_roles/);
  });
});

describe('membership invariants (T02, T04)', () => {
  it('admin cannot promote anyone to owner', async () => {
    const msg = await expectError(
      asUser(db, u.adminA, (tx) =>
        tx.query(
          `update public.organization_members set role = 'owner' where organization_id = $1 and user_id = $2`,
          [orgA, u.managerA],
        ),
      ),
    );
    expect(msg).toMatch(/OWNER_ROLE_REQUIRED/);
  });

  it('member cannot escalate own role', async () => {
    const affected = await asUser(
      db,
      u.editorA,
      async (tx) =>
        (
          await tx.query(
            `update public.organization_members set role = 'admin' where organization_id = $1 and user_id = $2`,
            [orgA, u.editorA],
          )
        ).affectedRows,
    );
    expect(affected).toBe(0);
  });

  it('the last owner cannot leave or be demoted', async () => {
    const leave = await expectError(
      asUser(db, u.ownerA, (tx) =>
        tx.query(
          `delete from public.organization_members where organization_id = $1 and user_id = $2`,
          [orgA, u.ownerA],
        ),
      ),
    );
    expect(leave).toMatch(/LAST_OWNER/);
    const demote = await expectError(
      asUser(db, u.ownerA, (tx) =>
        tx.query(
          `update public.organization_members set role = 'admin' where organization_id = $1 and user_id = $2`,
          [orgA, u.ownerA],
        ),
      ),
    );
    expect(demote).toMatch(/LAST_OWNER/);
  });

  it('a member can leave the organization', async () => {
    const affected = await asUser(
      db,
      u.viewerA,
      async (tx) =>
        (
          await tx.query(
            `delete from public.organization_members where organization_id = $1 and user_id = $2`,
            [orgA, u.viewerA],
          )
        ).affectedRows,
    );
    expect(affected).toBe(1);
  });
});

describe('profiles (T05)', () => {
  it('a user cannot make themselves platform admin', async () => {
    const msg = await expectError(
      asUser(db, u.outsider, (tx) =>
        tx.query(`update public.profiles set is_platform_admin = true where id = $1`, [u.outsider]),
      ),
    );
    expect(msg).toMatch(/permission denied/);
  });

  it('a user can update own name but not another user profile', async () => {
    const affected = await asUser(db, u.outsider, async (tx) => {
      const own = await tx.query(`update public.profiles set full_name = 'Me' where id = $1`, [
        u.outsider,
      ]);
      const other = await tx.query(
        `update public.profiles set full_name = 'Hacked' where id = $1`,
        [u.ownerA],
      );
      return [own.affectedRows, other.affectedRows];
    });
    expect(affected).toEqual([1, 0]);
  });

  it('profiles of users in other organizations are invisible', async () => {
    const n = await asUser(
      db,
      u.ownerB,
      async (tx) =>
        (
          await one(
            tx.query<{ n: number }>(
              `select count(*)::int as n from public.profiles where id = $1`,
              [u.ownerA],
            ),
          )
        ).n,
    );
    expect(n).toBe(0);
  });
});

describe('anonymous access', () => {
  it('anon cannot read any tenant table', async () => {
    for (const table of [
      'organizations',
      'properties',
      'apartments',
      'rooms',
      'profiles',
      'audit_logs',
    ]) {
      const msg = await expectError(asAnon(db, (tx) => tx.query(`select * from public.${table}`)));
      expect(msg, table).toMatch(/permission denied/);
    }
  });

  it('anon cannot call create_organization', async () => {
    const msg = await expectError(
      asAnon(db, (tx) => tx.query(`select public.create_organization('A', '${slug('anon-org')}')`)),
    );
    expect(msg).toMatch(/permission denied/);
  });
});

describe('audit log (T19)', () => {
  it('records changes and is visible to owners/admins but not editors', async () => {
    const ownerCount = await asUser(
      db,
      u.ownerA,
      async (tx) =>
        (
          await one(
            tx.query<{ n: number }>(
              `select count(*)::int as n from public.audit_logs where entity_type = 'apartments'`,
            ),
          )
        ).n,
    );
    expect(ownerCount).toBeGreaterThanOrEqual(2);
    const editorCount = await asUser(
      db,
      u.editorA,
      async (tx) =>
        (await one(tx.query<{ n: number }>(`select count(*)::int as n from public.audit_logs`))).n,
    );
    expect(editorCount).toBe(0);
  });

  it('cannot be modified or deleted by clients, even owners', async () => {
    for (const sql of [
      `update public.audit_logs set action = 'x'`,
      `delete from public.audit_logs`,
    ]) {
      const msg = await expectError(asUser(db, u.ownerA, (tx) => tx.query(sql)));
      expect(msg).toMatch(/permission denied/);
    }
  });

  it('records the acting user', async () => {
    const row = await asUser(db, u.ownerA, (tx) =>
      one(
        tx.query<{ actor_user_id: string }>(
          `select actor_user_id from public.audit_logs where entity_type = 'apartments' and entity_id = $1 and action = 'insert'`,
          [aptA1],
        ),
      ),
    );
    expect(row.actor_user_id).toBe(u.ownerA);
  });
});

describe('organization deletion', () => {
  it('admin cannot delete the organization; owner can, and children cascade', async () => {
    const adminAttempt = await asUser(
      db,
      u.adminA,
      async (tx) =>
        (await tx.query(`delete from public.organizations where id = $1`, [orgA])).affectedRows,
    );
    expect(adminAttempt).toBe(0);
    const crossTenantAttempt = await asUser(
      db,
      u.ownerB,
      async (tx) =>
        (await tx.query(`delete from public.organizations where id = $1`, [orgA])).affectedRows,
    );
    expect(crossTenantAttempt).toBe(0);

    const deleted = await asUser(
      db,
      u.ownerB,
      async (tx) =>
        (await tx.query(`delete from public.organizations where id = $1`, [orgB])).affectedRows,
    );
    expect(deleted).toBe(1);
    const leftovers = await db.query<{ n: number }>(
      `select (select count(*) from public.properties where organization_id = $1)
            + (select count(*) from public.apartments where id = $2)
            + (select count(*) from public.organization_members where organization_id = $1) as n`,
      [orgB, aptB],
    );
    expect(Number(leftovers.rows[0]!.n)).toBe(0);
  });
});
