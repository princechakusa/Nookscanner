/** Stage 8.1: appliance categories, model library and appliances (CRUD + isolation). */
import { beforeAll, describe, expect, it } from 'vitest';
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
const u = {} as Record<'owner' | 'editor' | 'viewer' | 'scoped' | 'ownerB' | 'outsider', string>;
let orgA: string;
let orgB: string;
let propA1: string;
let propA2: string;
let aptA1: string;
let aptA2: string;
let aptB: string;
let roomA1: string;
let roomA2: string;
let roomB: string;
let acCategory: string;
const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0]!;
const id = async (p: Promise<{ rows: { id: string }[] }>) => (await one(p)).id;

beforeAll(async () => {
  db = await createTestDb();
  for (const k of Object.keys({
    owner: 0,
    editor: 0,
    viewer: 0,
    scoped: 0,
    ownerB: 0,
    outsider: 0,
  }))
    u[k as keyof typeof u] = await createUser(db, `apl-${k}`);
  const org = (owner: string, name: string) =>
    asUser(db, owner, (tx) =>
      id(
        tx.query(`select public.create_organization($1, $2) as id`, [
          name,
          slug(name.toLowerCase()),
        ]),
      ),
    );
  orgA = await org(u.owner, 'AplA');
  orgB = await org(u.ownerB, 'AplB');
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role, scope) values
       ($1, $2, 'editor', 'organization'), ($1, $3, 'viewer', 'organization'), ($1, $4, 'editor', 'properties')`,
    [orgA, u.editor, u.viewer, u.scoped],
  );
  const property = (owner: string, orgId: string, name: string) =>
    asUser(db, owner, (tx) =>
      id(
        tx.query(
          `insert into public.properties (organization_id, name) values ($1, $2) returning id`,
          [orgId, name],
        ),
      ),
    );
  propA1 = await property(u.owner, orgA, 'P1');
  propA2 = await property(u.owner, orgA, 'P2');
  const propB = await property(u.ownerB, orgB, 'PB');
  await db.query(`insert into public.property_members (property_id, user_id) values ($1, $2)`, [
    propA1,
    u.scoped,
  ]);
  const apartment = (owner: string, prop: string) =>
    asUser(db, owner, (tx) =>
      id(
        tx.query(
          `insert into public.apartments (property_id, name) values ($1, 'A') returning id`,
          [prop],
        ),
      ),
    );
  aptA1 = await apartment(u.owner, propA1);
  aptA2 = await apartment(u.owner, propA2);
  aptB = await apartment(u.ownerB, propB);
  const room = (owner: string, apt: string) =>
    asUser(db, owner, (tx) =>
      id(
        tx.query(
          `insert into public.rooms (apartment_id, name_en, room_type) values ($1, 'Living room', 'living') returning id`,
          [apt],
        ),
      ),
    );
  roomA1 = await room(u.owner, aptA1);
  roomA2 = await room(u.owner, aptA2);
  roomB = await room(u.ownerB, aptB);
  acCategory = await id(
    db.query(`select id from public.appliance_categories where key = 'air_conditioner'`),
  );
}, 120_000);

const addAppliance = (
  user: string,
  apt: string,
  room: string,
  extra: Record<string, unknown> = {},
) =>
  asUser(db, user, (tx) =>
    id(
      tx.query(
        `insert into public.appliances (apartment_id, room_id, category_id, name_en, appliance_model_id, organization_id)
         values ($1, $2, $3, $4, $5, coalesce($6, (select organization_id from public.apartments where id = $1))) returning id`,
        [
          apt,
          room,
          acCategory,
          (extra.name as string) ?? 'Living room AC',
          extra.model ?? null,
          extra.org ?? null,
        ],
      ),
    ),
  );

describe('appliance categories', () => {
  it('are seeded with EN/AR names and aliases and readable by members only', async () => {
    const rows = await asUser(
      db,
      u.viewer,
      async (tx) =>
        (
          await tx.query<{ key: string; aliases_en: string[] }>(
            `select key, aliases_en from public.appliance_categories`,
          )
        ).rows,
    );
    expect(rows.length).toBeGreaterThanOrEqual(20);
    expect(rows.find((r) => r.key === 'air_conditioner')?.aliases_en).toContain('ac');
    expect(
      await expectError(asAnon(db, (tx) => tx.query(`select 1 from public.appliance_categories`))),
    ).toMatch(/permission denied/);
  });

  it('cannot be changed by users (platform data)', async () => {
    expect(
      await expectError(
        asUser(db, u.owner, (tx) =>
          tx.query(`update public.appliance_categories set name_en = 'x' where key = 'tv'`),
        ),
      ),
    ).toMatch(/permission denied/);
  });
});

describe('appliance model library', () => {
  it('organization rows: written by org-scoped appliance writers, seen only by members', async () => {
    const model = await asUser(db, u.editor, (tx) =>
      id(
        tx.query(
          `insert into public.appliance_models (organization_id, category_id, brand, model_number, manual_url)
           values ($1, $2, 'Daikin', 'FTXM35R', 'https://example.test/manual.pdf') returning id`,
          [orgA, acCategory],
        ),
      ),
    );
    const seen = (user: string) =>
      asUser(
        db,
        user,
        async (tx) =>
          (await tx.query(`select 1 from public.appliance_models where id = $1`, [model])).rows
            .length,
      );
    expect(await seen(u.viewer)).toBe(1);
    expect(await seen(u.ownerB)).toBe(0);
    expect(await seen(u.outsider)).toBe(0);
    // Same brand + model again in the same organization (case-insensitive) is a duplicate.
    expect(
      await expectError(
        asUser(db, u.owner, (tx) =>
          tx.query(
            `insert into public.appliance_models (organization_id, category_id, brand, model_number) values ($1, $2, 'daikin', 'ftxm35r')`,
            [orgA, acCategory],
          ),
        ),
      ),
    ).toMatch(/duplicate key/);
  });

  it('viewers, property-scoped members and other organizations cannot write; manuals must be https', async () => {
    const insert = (user: string, orgId: string, url: string | null = null) =>
      asUser(db, user, (tx) =>
        tx.query(
          `insert into public.appliance_models (organization_id, category_id, brand, model_number, manual_url) values ($1, $2, 'LG', $3, $4)`,
          [orgId, acCategory, slug('m'), url],
        ),
      );
    for (const user of [u.viewer, u.scoped, u.ownerB]) {
      expect(await expectError(insert(user, orgA))).toMatch(/row-level security/);
    }
    expect(await expectError(insert(u.owner, orgA, 'http://example.test/x.pdf'))).toMatch(
      /check constraint/,
    );
    expect(await expectError(insert(u.owner, orgA, 'javascript:alert(1)'))).toMatch(
      /check constraint/,
    );
  });

  it('global rows are readable by every member and written only by the platform', async () => {
    const global = await id(
      db.query(
        `insert into public.appliance_models (organization_id, category_id, brand, model_number) values (null, $1, 'Samsung', $2) returning id`,
        [acCategory, slug('g')],
      ),
    );
    const seen = await asUser(
      db,
      u.ownerB,
      async (tx) =>
        (await tx.query(`select 1 from public.appliance_models where id = $1`, [global])).rows
          .length,
    );
    expect(seen).toBe(1);
    const changed = await asUser(
      db,
      u.owner,
      async (tx) =>
        (
          await tx.query(
            `update public.appliance_models set brand = 'X' where id = $1 returning id`,
            [global],
          )
        ).rows.length,
    );
    expect(changed).toBe(0);
    expect(
      await expectError(
        asUser(db, u.owner, (tx) =>
          tx.query(
            `insert into public.appliance_models (organization_id, category_id, brand, model_number) values (null, $1, 'Sneaky', 'G1')`,
            [acCategory],
          ),
        ),
      ),
    ).toMatch(/row-level security/);
  });
});

describe('appliances', () => {
  it('editors create, rename and delete appliances in their apartments', async () => {
    const appliance = await addAppliance(u.editor, aptA1, roomA1);
    await asUser(db, u.editor, (tx) =>
      tx.query(`update public.appliances set name_en = 'Main AC', brand = 'Daikin' where id = $1`, [
        appliance,
      ]),
    );
    const r = await one(
      db.query<{ name_en: string; organization_id: string }>(
        `select name_en, organization_id from public.appliances where id = $1`,
        [appliance],
      ),
    );
    expect(r).toEqual({ name_en: 'Main AC', organization_id: orgA });
    const deleted = await asUser(
      db,
      u.editor,
      async (tx) =>
        (await tx.query(`delete from public.appliances where id = $1 returning id`, [appliance]))
          .rows.length,
    );
    expect(deleted).toBe(1);
  });

  it('viewers read but cannot write; other organizations see nothing', async () => {
    const appliance = await addAppliance(u.owner, aptA1, roomA1);
    const seen = (user: string) =>
      asUser(
        db,
        user,
        async (tx) =>
          (await tx.query(`select 1 from public.appliances where id = $1`, [appliance])).rows
            .length,
      );
    expect(await seen(u.viewer)).toBe(1);
    expect(await seen(u.ownerB)).toBe(0);
    expect(await seen(u.outsider)).toBe(0);
    expect(await expectError(addAppliance(u.viewer, aptA1, roomA1))).toMatch(/row-level security/);
    const changed = await asUser(
      db,
      u.ownerB,
      async (tx) =>
        (
          await tx.query(
            `update public.appliances set name_en = 'hacked' where id = $1 returning id`,
            [appliance],
          )
        ).rows.length,
    );
    expect(changed).toBe(0);
    expect(await expectError(addAppliance(u.ownerB, aptA1, roomA1, { org: orgB }))).toMatch(
      /row-level security|organization mismatch/,
    );
  });

  it('property-scoped members only see and write appliances in their assigned property', async () => {
    const inA2 = await addAppliance(u.owner, aptA2, roomA2);
    const own = await addAppliance(u.scoped, aptA1, roomA1);
    const visible = await asUser(db, u.scoped, async (tx) =>
      (
        await tx.query<{ id: string }>(`select id from public.appliances where id = any($1)`, [
          [inA2, own],
        ])
      ).rows.map((r) => r.id),
    );
    expect(visible).toEqual([own]);
    expect(await expectError(addAppliance(u.scoped, aptA2, roomA2))).toMatch(/row-level security/);
  });

  it('refuses a room of another apartment, a model of another organization and an org spoof', async () => {
    expect(await expectError(addAppliance(u.owner, aptA1, roomA2))).toMatch(
      /room is not in this apartment/,
    );
    expect(await expectError(addAppliance(u.owner, aptA1, roomB))).toMatch(
      /room is not in this apartment/,
    );
    const modelB = await asUser(db, u.ownerB, (tx) =>
      id(
        tx.query(
          `insert into public.appliance_models (organization_id, category_id, brand, model_number) values ($1, $2, 'B', $3) returning id`,
          [orgB, acCategory, slug('b')],
        ),
      ),
    );
    expect(await expectError(addAppliance(u.owner, aptA1, roomA1, { model: modelB }))).toMatch(
      /model not available/,
    );
    expect(await expectError(addAppliance(u.owner, aptA1, roomA1, { org: orgB }))).toMatch(
      /row-level security|organization mismatch/,
    );
    // Moving an appliance to another organization's apartment is refused.
    const a = await addAppliance(u.owner, aptA1, roomA1);
    expect(
      await expectError(
        asUser(db, u.owner, (tx) =>
          tx.query(`update public.appliances set apartment_id = $2, room_id = $3 where id = $1`, [
            a,
            aptB,
            roomB,
          ]),
        ),
      ),
    ).toMatch(/row-level security|organization mismatch|organization_id cannot change/);
  });

  it('deleting a room deletes its appliances', async () => {
    const r = await asUser(db, u.owner, (tx) =>
      id(
        tx.query(
          `insert into public.rooms (apartment_id, name_en, room_type) values ($1, $2, 'kitchen') returning id`,
          [aptA1, slug('Kitchen')],
        ),
      ),
    );
    const a = await addAppliance(u.owner, aptA1, r);
    await asUser(db, u.owner, (tx) => tx.query(`delete from public.rooms where id = $1`, [r]));
    expect(
      (await db.query(`select 1 from public.appliances where id = $1`, [a])).rows,
    ).toHaveLength(0);
  });
});
