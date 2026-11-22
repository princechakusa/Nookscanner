/** Stage 8.5: publish rules PB-01..03 and the guest snapshot built from verified content. */
import { guestExperienceSchema } from '@nookscanner/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, expectError, slug, type TestDb } from './support/db.ts';

let db: TestDb;
const u = {} as Record<'owner' | 'editor' | 'ownerB', string>;
let org: string;
let prop: string;
let category: string;
const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0]!;
const id = async (p: Promise<{ rows: { id: string }[] }>) => (await one(p)).id;
const as = <T>(user: string, sql: string, params: unknown[] = []) =>
  asUser(db, user, (tx) => tx.query<T>(sql, params));

beforeAll(async () => {
  db = await createTestDb();
  for (const k of ['owner', 'editor', 'ownerB'] as const) u[k] = await createUser(db, `pb-${k}`);
  org = await asUser(db, u.owner, (tx) =>
    id(tx.query(`select public.create_organization('Pb', $1) as id`, [slug('pb')])),
  );
  await asUser(db, u.ownerB, (tx) =>
    tx.query(`select public.create_organization('PbB', $1)`, [slug('pbb')]),
  );
  await db.query(
    `insert into public.organization_members (organization_id, user_id, role) values ($1, $2, 'editor')`,
    [org, u.editor],
  );
  prop = await asUser(db, u.owner, (tx) =>
    id(
      tx.query(
        `insert into public.properties (organization_id, name, support_whatsapp) values ($1, 'Marina Tower', '971501234567') returning id`,
        [org],
      ),
    ),
  );
  category = await id(
    db.query(`select id from public.appliance_categories where key = 'air_conditioner'`),
  );
}, 120_000);

/** A complete apartment: 2 rooms, aligned scene with viewpoints + doorway, AC with EN+AR text and a pin. */
async function readyApartment(opts: { verify?: boolean } = {}) {
  const verify = opts.verify ?? true;
  const apt = await asUser(db, u.owner, (tx) =>
    id(
      tx.query(`insert into public.apartments (property_id, name) values ($1, $2) returning id`, [
        prop,
        slug('Flat'),
      ]),
    ),
  );
  const room = (name: string, type: string, order: number) =>
    asUser(db, u.owner, (tx) =>
      id(
        tx.query(
          `insert into public.rooms (apartment_id, name_en, name_ar, room_type, sort_order) values ($1, $2, $3, $4, $5) returning id`,
          [apt, name, type === 'entrance' ? 'المدخل' : null, type, order],
        ),
      ),
    );
  const entrance = await room('Entrance', 'entrance', 1);
  const living = await room('Living room', 'living', 2);
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
  const path = `org/${org}/apartments/${apt}/scenes/${j}/a1/scene.sog`;
  await db.query(
    `insert into public.processing_results (organization_id, processing_job_id, report) values ($1, $2, $3)`,
    [
      org,
      j,
      JSON.stringify({
        files: [
          { path: 'scene.sog', sizeBytes: 8_000_000, sha256: 'a'.repeat(64), storagePath: path },
        ],
      }),
    ],
  );
  await as(u.owner, `select public.review_processing_result($1, 'approved', '{}'::jsonb, null)`, [
    j,
  ]);
  const scene = await id(
    db.query(`select id from public.scene_versions where processing_job_id = $1`, [j]),
  );
  await as(u.owner, `select public.save_scene_alignment($1, $2, $3, $4)`, [
    scene,
    JSON.stringify({ matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1], scale: 1 }),
    JSON.stringify({ min: [-3, 0, -4], max: [3, 2.6, 4] }),
    JSON.stringify({ position: [0, 1.5, 3], target: [0, 1.5, 0] }),
  ]);
  await as(u.owner, `select public.save_scene_navigation($1, $2, $3)`, [
    scene,
    JSON.stringify([
      { room: entrance, position: [0, 1.5, 3], target: [0, 1.5, 0] },
      { room: living, position: [1, 1.5, -2], target: [2, 1.5, -2] },
    ]),
    JSON.stringify([{ a: entrance, b: living, position: [0, 0, 1] }]),
  ]);
  const ac = await asUser(db, u.editor, (tx) =>
    id(
      tx.query(
        `insert into public.appliances (apartment_id, room_id, category_id, name_en, name_ar, brand) values ($1, $2, $3, 'Living room AC', 'مكيف', 'Daikin') returning id`,
        [apt, living, category],
      ),
    ),
  );
  const ins = await asUser(db, u.editor, (tx) =>
    id(tx.query(`insert into public.instructions (appliance_id) values ($1) returning id`, [ac])),
  );
  const addVersion = (locale: string, title: string, steps: string[]) =>
    asUser(db, u.editor, (tx) =>
      id(
        tx.query(
          `insert into public.instruction_versions (instruction_id, locale, version, title, steps, troubleshooting)
           values ($1, $2, 1, $3, $4, '[{"problem":"No cold air","solution":"Close the windows."}]') returning id`,
          [ins, locale, title, JSON.stringify(steps.map((text) => ({ text })))],
        ),
      ),
    );
  const en = await addVersion('en', 'Cooling', ['Press **Power**', 'Choose Cool']);
  const ar = await addVersion('ar', 'التبريد', ['اضغط **تشغيل**', 'اختر التبريد']);
  const hotspot = await asUser(db, u.editor, (tx) =>
    id(
      tx.query(
        `insert into public.hotspots (scene_version_id, appliance_id, position) values ($1, $2, '{1.5,1.2,-2.5}') returning id`,
        [scene, ac],
      ),
    ),
  );
  if (verify) {
    for (const v of [en, ar])
      await as(u.owner, `select public.verify_instruction_version($1)`, [v]);
    await as(u.owner, `select public.verify_hotspot($1)`, [hotspot]);
  }
  return { apt, scene, entrance, living, ac, ins, en, hotspot, path, addVersion };
}

const check = async (user: string, apt: string, scene: string) =>
  (
    await one(
      as<{ p: { code: string; id?: string }[] }>(user, `select public.publish_check($1, $2) as p`, [
        apt,
        scene,
      ]),
    )
  ).p;
const publish = (user: string, apt: string, scene: string) =>
  asUser(
    db,
    user,
    async (tx) =>
      (await tx.query<{ v: number }>(`select public.publish_apartment($1, $2) as v`, [apt, scene]))
        .rows[0]!.v,
  );
const latestSnapshot = async (apt: string) =>
  await one(
    db.query<{ snapshot: Record<string, unknown>; version: number }>(
      `select snapshot, version from public.published_versions where apartment_id = $1 order by version desc limit 1`,
      [apt],
    ),
  );

describe('publishing (8.5)', () => {
  it('PB-01: unverified pins and instructions block publishing, with reasons', async () => {
    const a = await readyApartment({ verify: false });
    const problems = await check(u.owner, a.apt, a.scene);
    expect(problems.map((p) => p.code).sort()).toEqual([
      'HOTSPOT_UNVERIFIED',
      'INSTRUCTION_UNVERIFIED',
    ]);
    expect(await expectError(publish(u.owner, a.apt, a.scene))).toMatch(/PUBLISH_BLOCKED/);
  });

  it('PB-01: rooms without a viewpoint or not reachable from the entrance block publishing', async () => {
    const a = await readyApartment();
    await as(
      u.owner,
      `insert into public.rooms (apartment_id, name_en, room_type, sort_order) values ($1, 'Store', 'storage', 9)`,
      [a.apt],
    );
    const codes = (await check(u.owner, a.apt, a.scene)).map((p) => p.code).sort();
    expect(codes).toEqual(['ROOM_UNREACHABLE', 'ROOM_WITHOUT_VIEWPOINT']);
  });

  it('publishes a snapshot that the guest app accepts, from verified content only', async () => {
    const a = await readyApartment();
    expect(await check(u.owner, a.apt, a.scene)).toEqual([]);
    expect(await publish(u.owner, a.apt, a.scene)).toBe(1);
    // A later, unverified edit must not reach guests.
    await a.addVersion('en', 'Cooling (draft)', ['Unreviewed text']);
    const { snapshot } = await latestSnapshot(a.apt);
    const scene = snapshot.scene as Record<string, unknown>;
    expect(scene.path).toBe(a.path);
    expect(scene.hotspots).toEqual([{ applianceId: a.ac, position: [1.5, 1.2, -2.5] }]);
    // The guest function (9.1) replaces the private path with a signed URL.
    const payload = { ...snapshot, scene: { ...scene, url: 'https://cdn.test/s.sog' } };
    const parsed = guestExperienceSchema.parse(payload);
    expect(parsed.rooms.map((r) => r.name.en)).toEqual(['Entrance', 'Living room']);
    expect(parsed.rooms[0]!.name.ar).toBe('المدخل');
    const ac = parsed.appliances[0]!;
    expect(ac.steps.map((s) => s.text)).toEqual([
      { en: 'Press **Power**', ar: 'اضغط **تشغيل**' },
      { en: 'Choose Cool', ar: 'اختر التبريد' },
    ]);
    expect(ac.aliases.en).toContain('ac');
    expect(parsed.support).toEqual({ whatsapp: '971501234567' });
    expect(parsed.scene?.sizeBytes).toBe(8_000_000);
    const status = await one(
      db.query<{ status: string }>(`select status::text from public.apartments where id = $1`, [
        a.apt,
      ]),
    );
    expect(status.status).toBe('published');
  });

  it('PB-02: republishing makes a new version; the published scene is frozen', async () => {
    const a = await readyApartment();
    await publish(u.owner, a.apt, a.scene);
    expect(await publish(u.owner, a.apt, a.scene)).toBe(2);
    expect((await latestSnapshot(a.apt)).version).toBe(2);
    expect(
      await expectError(
        as(u.editor, `update public.hotspots set position = '{0,1,0}' where id = $1`, [a.hotspot]),
      ),
    ).toMatch(/frozen/);
    expect(
      await expectError(
        as(
          u.owner,
          `update public.published_versions set snapshot = '{}' where apartment_id = $1`,
          [a.apt],
        ),
      ),
    ).toMatch(/permission denied/);
  });

  it('PB-03: unpublish takes the apartment out of published at once; only publishers may do either', async () => {
    const a = await readyApartment();
    expect(await expectError(publish(u.editor, a.apt, a.scene))).toMatch(/NOT_FOUND/);
    expect(await expectError(publish(u.ownerB, a.apt, a.scene))).toMatch(/NOT_FOUND/);
    await publish(u.owner, a.apt, a.scene);
    expect(
      await expectError(as(u.editor, `select public.unpublish_apartment($1)`, [a.apt])),
    ).toMatch(/NOT_FOUND/);
    await as(u.owner, `select public.unpublish_apartment($1)`, [a.apt]);
    const status = await one(
      db.query<{ status: string }>(`select status::text from public.apartments where id = $1`, [
        a.apt,
      ]),
    );
    expect(status.status).toBe('review');
    // Status cannot be set to published directly.
    expect(
      await expectError(
        as(u.owner, `update public.apartments set status = 'published' where id = $1`, [a.apt]),
      ),
    ).toMatch(/publish_apartment/);
  });
});
