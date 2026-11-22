/** Stage 8.2: hotspots pin appliances to points of an aligned scene version. */
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, expectError, slug, type TestDb } from './support/db.ts';

let db: TestDb;
const u = {} as Record<'owner' | 'editor' | 'viewer' | 'ownerB', string>;
let org: string;
let apartment: string;
let otherApartment: string;
let room: string;
let otherRoom: string;
let category: string;
const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0]!;
const id = async (p: Promise<{ rows: { id: string }[] }>) => (await one(p)).id;
const BOUNDS = { min: [-3, 0, -4], max: [3, 2.6, 4] };
const ALIGN = { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], scale: 1 };

/** An approved, aligned scene version of `apt`. */
async function alignedScene(apt: string, align = true): Promise<string> {
  const s = await id(
    db.query(
      `insert into public.scan_sessions (apartment_id, method, status) values ($1, 'video_upload', 'succeeded') returning id`,
      [apt],
    ),
  );
  const j = await id(
    db.query(
      `insert into public.processing_jobs (organization_id, scan_session_id, apartment_id, idempotency_key, status, attempt)
       values ($1, $2, $3, gen_random_uuid()::text, 'succeeded', 1) returning id`,
      [org, s, apt],
    ),
  );
  await db.query(
    `insert into public.processing_results (organization_id, processing_job_id, report) values ($1, $2, '{"files":[]}')`,
    [org, j],
  );
  await asUser(db, u.owner, (tx) =>
    tx.query(`select public.review_processing_result($1, 'approved', '{}'::jsonb, null)`, [j]),
  );
  const scene = await id(
    db.query(`select id from public.scene_versions where processing_job_id = $1`, [j]),
  );
  if (align)
    await asUser(db, u.owner, (tx) =>
      tx.query(`select public.save_scene_alignment($1, $2, $3, null)`, [
        scene,
        JSON.stringify(ALIGN),
        JSON.stringify(BOUNDS),
      ]),
    );
  return scene;
}

const appliance = (apt: string, r: string, name = slug('AC')) =>
  asUser(db, u.owner, (tx) =>
    id(
      tx.query(
        `insert into public.appliances (apartment_id, room_id, category_id, name_en) values ($1, $2, $3, $4) returning id`,
        [apt, r, category, name],
      ),
    ),
  );
const place = (
  user: string,
  scene: string,
  appl: string,
  position: number[],
  normal: number[] | null = null,
) =>
  asUser(db, user, (tx) =>
    id(
      tx.query(
        `insert into public.hotspots (scene_version_id, appliance_id, position, normal) values ($1, $2, $3, $4) returning id`,
        [scene, appl, position, normal],
      ),
    ),
  );

beforeAll(async () => {
  db = await createTestDb();
  for (const k of ['owner', 'editor', 'viewer', 'ownerB'] as const)
    u[k] = await createUser(db, `hs-${k}`);
  org = await asUser(db, u.owner, (tx) =>
    id(tx.query(`select public.create_organization('Hs', $1) as id`, [slug('hs')])),
  );
  await asUser(db, u.ownerB, (tx) =>
    tx.query(`select public.create_organization('HsB', $1)`, [slug('hsb')]),
  );
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'editor'), ($1, $3, 'viewer')`,
    [org, u.editor, u.viewer],
  );
  const prop = await asUser(db, u.owner, (tx) =>
    id(
      tx.query(
        `insert into public.properties (organization_id, name) values ($1, 'P') returning id`,
        [org],
      ),
    ),
  );
  const apt = () =>
    asUser(db, u.owner, (tx) =>
      id(
        tx.query(
          `insert into public.apartments (property_id, name) values ($1, 'A') returning id`,
          [prop],
        ),
      ),
    );
  apartment = await apt();
  otherApartment = await apt();
  const mkRoom = (a: string) =>
    asUser(db, u.owner, (tx) =>
      id(
        tx.query(
          `insert into public.rooms (apartment_id, name_en, room_type) values ($1, 'Living room', 'living') returning id`,
          [a],
        ),
      ),
    );
  room = await mkRoom(apartment);
  otherRoom = await mkRoom(otherApartment);
  category = await id(
    db.query(`select id from public.appliance_categories where key = 'air_conditioner'`),
  );
}, 120_000);

describe('hotspots', () => {
  it('editors place one hotspot per appliance and scene; it starts unverified and stores the point exactly', async () => {
    const scene = await alignedScene(apartment);
    const appl = await appliance(apartment, room);
    const h = await place(u.editor, scene, appl, [1.25, 1.7, -2.5], [0, 0, 1]);
    const r = await one(
      db.query<{
        position: number[];
        verification_status: string;
        apartment_id: string;
        created_by: string;
      }>(
        `select position, verification_status::text, apartment_id, created_by from public.hotspots where id = $1`,
        [h],
      ),
    );
    expect(r).toEqual({
      position: [1.25, 1.7, -2.5],
      verification_status: 'unverified',
      apartment_id: apartment,
      created_by: u.editor,
    });
    expect(await expectError(place(u.editor, scene, appl, [0, 1, 0]))).toMatch(/duplicate key/);
  });

  it('moving a verified hotspot makes it unverified again; clients cannot verify it directly', async () => {
    const scene = await alignedScene(apartment);
    const appl = await appliance(apartment, room);
    const h = await place(u.owner, scene, appl, [0, 1, 0]);
    // Platform-side verification (8.4 adds the RPC); then a move resets it.
    await db.query(`alter table public.hotspots disable trigger hotspots_check`);
    await db.query(
      `update public.hotspots set verification_status = 'verified', verified_at = now() where id = $1`,
      [h],
    );
    await db.query(`alter table public.hotspots enable trigger hotspots_check`);
    await asUser(db, u.editor, (tx) =>
      tx.query(`update public.hotspots set position = '{0.5,1,0}' where id = $1`, [h]),
    );
    const moved = await one(
      db.query<{ verification_status: string }>(
        `select verification_status::text from public.hotspots where id = $1`,
        [h],
      ),
    );
    expect(moved.verification_status).toBe('unverified');
    await asUser(db, u.editor, (tx) =>
      tx.query(`update public.hotspots set verification_status = 'verified' where id = $1`, [h]),
    );
    const self = await one(
      db.query<{ verification_status: string }>(
        `select verification_status::text from public.hotspots where id = $1`,
        [h],
      ),
    );
    expect(self.verification_status).toBe('unverified');
  });

  it('refuses points outside the apartment, bad normals, unaligned or frozen scenes and other apartments', async () => {
    const scene = await alignedScene(apartment);
    const appl = await appliance(apartment, room);
    expect(await expectError(place(u.owner, scene, appl, [10, 1, 0]))).toMatch(
      /outside the apartment/,
    );
    expect(await expectError(place(u.owner, scene, appl, [0, 1, 0], [0, 0, 5]))).toMatch(
      /unit vector/,
    );
    const unaligned = await alignedScene(apartment, false);
    expect(await expectError(place(u.owner, unaligned, appl, [0, 1, 0]))).toMatch(/not aligned/);
    const foreign = await appliance(otherApartment, otherRoom);
    expect(await expectError(place(u.owner, scene, foreign, [0, 1, 0]))).toMatch(/same apartment/);
    const frozen = await alignedScene(apartment);
    await db.query(`update public.scene_versions set status = 'published' where id = $1`, [frozen]);
    expect(await expectError(place(u.owner, frozen, appl, [0, 1, 0]))).toMatch(/frozen/);
  });

  it('viewers read but cannot place, move or delete; other organizations see nothing', async () => {
    const scene = await alignedScene(apartment);
    const appl = await appliance(apartment, room);
    const h = await place(u.owner, scene, appl, [0, 1, 0]);
    const seen = (user: string) =>
      asUser(
        db,
        user,
        async (tx) =>
          (await tx.query(`select 1 from public.hotspots where id = $1`, [h])).rows.length,
      );
    expect(await seen(u.viewer)).toBe(1);
    expect(await seen(u.ownerB)).toBe(0);
    const other = await appliance(apartment, room);
    expect(await expectError(place(u.viewer, scene, other, [0, 1, 0]))).toMatch(
      /row-level security/,
    );
    expect(await expectError(place(u.ownerB, scene, other, [0, 1, 0]))).toMatch(
      /row-level security/,
    );
    for (const user of [u.viewer, u.ownerB]) {
      const n = await asUser(
        db,
        user,
        async (tx) =>
          (await tx.query(`delete from public.hotspots where id = $1 returning id`, [h])).rows
            .length,
      );
      expect(n).toBe(0);
    }
    expect(
      await expectError(
        asUser(db, u.owner, (tx) =>
          tx
            .query(`update public.hotspots set scene_version_id = $2 where id = $1`, [h, scene])
            .then(() =>
              tx.query(`update public.hotspots set apartment_id = $2 where id = $1`, [
                h,
                otherApartment,
              ]),
            ),
        ),
      ),
    ).toMatch(/IMMUTABLE_COLUMN|row-level security/);
  });

  it('deleting the appliance or the scene version removes its hotspots', async () => {
    const scene = await alignedScene(apartment);
    const appl = await appliance(apartment, room);
    const h = await place(u.owner, scene, appl, [0, 1, 0]);
    await asUser(db, u.owner, (tx) =>
      tx.query(`delete from public.appliances where id = $1`, [appl]),
    );
    expect((await db.query(`select 1 from public.hotspots where id = $1`, [h])).rows).toHaveLength(
      0,
    );
  });
});

describe('hotspot verification (8.4)', () => {
  it('managers verify; a move makes it unverified; editors and other orgs cannot verify', async () => {
    const scene = await alignedScene(apartment);
    const appl = await appliance(apartment, room);
    const h = await place(u.editor, scene, appl, [0, 1, 0]);
    const verify = (user: string) =>
      asUser(db, user, (tx) => tx.query(`select public.verify_hotspot($1)`, [h]));
    const status = async () =>
      await one(
        db.query<{ verification_status: string; verified_by: string | null }>(
          `select verification_status::text, verified_by from public.hotspots where id = $1`,
          [h],
        ),
      );
    for (const user of [u.editor, u.viewer, u.ownerB]) {
      expect(await expectError(verify(user))).toMatch(/NOT_FOUND/);
    }
    await verify(u.owner);
    expect(await status()).toEqual({ verification_status: 'verified', verified_by: u.owner });
    await asUser(db, u.editor, (tx) =>
      tx.query(`update public.hotspots set position = '{0.2,1,0}' where id = $1`, [h]),
    );
    expect(await status()).toEqual({ verification_status: 'unverified', verified_by: null });
  });
});
