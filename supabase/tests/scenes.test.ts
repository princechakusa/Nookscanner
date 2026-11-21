/** Stage 7.3: scene versions from approved reconstructions, and saving their alignment. */
import { beforeAll, describe, expect, it } from 'vitest';
import { asUser, createTestDb, createUser, expectError, slug, type TestDb } from './support/db.ts';

let db: TestDb;
const u = {} as Record<'owner' | 'editor' | 'outsider', string>;
let org: string;
let apartment: string;
const one = async <T>(p: Promise<{ rows: T[] }>) => (await p).rows[0]!;

/** A finished job with a report listing scene.sog, as job-callback stores it. */
async function finishedJob(): Promise<string> {
  const s = await one(
    db.query<{ id: string }>(
      `insert into public.scan_sessions (apartment_id, method, created_by, status) values ($1, 'video_upload', $2, 'succeeded') returning id`,
      [apartment, u.owner],
    ),
  );
  const j = await one(
    db.query<{ id: string }>(
      `insert into public.processing_jobs (organization_id, scan_session_id, apartment_id, idempotency_key, status, attempt)
       values ($1, $2, $3, gen_random_uuid()::text, 'succeeded', 1) returning id`,
      [org, s.id, apartment],
    ),
  );
  const report = {
    heldout: { psnr: 27 },
    files: [
      {
        path: 'scene.sog',
        sizeBytes: 9,
        sha256: 'a'.repeat(64),
        storagePath: `org/${org}/apartments/${apartment}/scenes/${j.id}/a1/scene.sog`,
      },
    ],
  };
  await db.query(
    `insert into public.processing_results (organization_id, processing_job_id, report) values ($1, $2, $3)`,
    [org, j.id, JSON.stringify(report)],
  );
  return j.id;
}

const review = (user: string, job: string, decision: string) =>
  asUser(db, user, (tx) =>
    tx.query(`select public.review_processing_result($1, $2, '{}'::jsonb, $3)`, [
      job,
      decision,
      decision === 'rejected' ? 'too dark' : null,
    ]),
  );

const ALIGN = { matrix: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 0, -1, 0, 1], scale: 2 };
const BOUNDS = { min: [-3, 0, -4], max: [3, 2.6, 4] };
const save = (user: string, scene: string, alignment: unknown, bounds: unknown, start?: unknown) =>
  asUser(db, user, (tx) =>
    tx.query(`select public.save_scene_alignment($1, $2, $3, $4)`, [
      scene,
      JSON.stringify(alignment),
      JSON.stringify(bounds),
      start === undefined ? null : JSON.stringify(start),
    ]),
  );

beforeAll(async () => {
  db = await createTestDb();
  for (const k of ['owner', 'editor', 'outsider'] as const) u[k] = await createUser(db, `scn-${k}`);
  org = (
    await asUser(db, u.owner, (tx) =>
      one(
        tx.query<{ id: string }>(`select public.create_organization('Scn', $1) as id`, [
          slug('scn'),
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

describe('scene versions', () => {
  it('approval creates numbered draft versions pointing at the scene file; rejection does not', async () => {
    const j1 = await finishedJob();
    await review(u.owner, j1, 'approved');
    const j2 = await finishedJob();
    await review(u.owner, j2, 'rejected');
    const j3 = await finishedJob();
    await review(u.owner, j3, 'approved');
    const { rows } = await db.query<{
      version: number;
      status: string;
      scene_path: string;
      processing_job_id: string;
    }>(
      `select version, status::text, scene_path, processing_job_id from public.scene_versions where apartment_id = $1 order by version`,
      [apartment],
    );
    expect(rows.map((r) => [r.version, r.status, r.processing_job_id])).toEqual([
      [1, 'draft', j1],
      [2, 'draft', j3],
    ]);
    expect(rows[0]!.scene_path).toMatch(new RegExp(`/scenes/${j1}/a1/scene\\.sog$`));
  });

  it('saves a valid alignment and marks the version approved', async () => {
    const j = await finishedJob();
    await review(u.owner, j, 'approved');
    const scene = await one(
      db.query<{ id: string }>(
        `select id from public.scene_versions where processing_job_id = $1`,
        [j],
      ),
    );
    await save(u.owner, scene.id, ALIGN, BOUNDS, { position: [0, 1.6, 3], target: [0, 1.6, 0] });
    const r = await one(
      db.query<{ status: string; bounds: unknown; aligned_by: string }>(
        `select status::text, bounds, aligned_by from public.scene_versions where id = $1`,
        [scene.id],
      ),
    );
    expect(r).toEqual({ status: 'approved', bounds: BOUNDS, aligned_by: u.owner });
  });

  it('rejects malformed alignment, bounds and start views', async () => {
    const j = await finishedJob();
    await review(u.owner, j, 'approved');
    const { id } = await one(
      db.query<{ id: string }>(
        `select id from public.scene_versions where processing_job_id = $1`,
        [j],
      ),
    );
    for (const [a, b, s] of [
      [{ matrix: [1, 2, 3], scale: 1 }, BOUNDS, undefined],
      [{ ...ALIGN, scale: 0 }, BOUNDS, undefined],
      [ALIGN, { min: [0, 0, 0], max: [0.5, 2, 4] }, undefined],
      [ALIGN, { min: [0, 0, 0], max: [500, 2, 4] }, undefined],
      [ALIGN, BOUNDS, { position: [0, 1], target: [0, 0, 0] }],
    ] as const) {
      expect(await expectError(save(u.owner, id, a, b, s))).toMatch(/VALIDATION_FAILED/);
    }
  });

  it('only members with scan.review in the same organization can align', async () => {
    const j = await finishedJob();
    await review(u.owner, j, 'approved');
    const { id } = await one(
      db.query<{ id: string }>(
        `select id from public.scene_versions where processing_job_id = $1`,
        [j],
      ),
    );
    expect(await expectError(save(u.editor, id, ALIGN, BOUNDS))).toMatch(/NOT_FOUND/);
    expect(await expectError(save(u.outsider, id, ALIGN, BOUNDS))).toMatch(/NOT_FOUND/);
    const seen = await asUser(
      db,
      u.editor,
      async (tx) =>
        (await tx.query(`select 1 from public.scene_versions where id = $1`, [id])).rows.length,
    );
    expect(seen).toBe(1);
    expect(
      await expectError(
        asUser(db, u.owner, (tx) =>
          tx.query(`update public.scene_versions set status = 'published' where id = $1`, [id]),
        ),
      ),
    ).toMatch(/permission denied/);
  });
});

describe('scene navigation (7.4)', () => {
  const room = (apt: string, name: string, type: string, order: number) =>
    asUser(
      db,
      u.owner,
      async (tx) =>
        (
          await one(
            tx.query<{ id: string }>(
              `insert into public.rooms (apartment_id, name_en, room_type, sort_order) values ($1, $2, $3, $4) returning id`,
              [apt, name, type, order],
            ),
          )
        ).id,
    );
  const nav = (user: string, scene: string, views: unknown, doors: unknown) =>
    asUser(db, user, (tx) =>
      tx.query(`select public.save_scene_navigation($1, $2, $3)`, [
        scene,
        JSON.stringify(views),
        JSON.stringify(doors),
      ]),
    );
  const sceneFor = async (align: boolean) => {
    const j = await finishedJob();
    await review(u.owner, j, 'approved');
    const { id } = await one(
      db.query<{ id: string }>(
        `select id from public.scene_versions where processing_job_id = $1`,
        [j],
      ),
    );
    if (align) await save(u.owner, id, ALIGN, BOUNDS);
    return id;
  };
  const view = (r: string, x = 0) => ({ room: r, position: [x, 1.6, 0], target: [x, 1.6, -1] });

  it('stores viewpoints and doorways, replacing the previous set; pairs are unordered', async () => {
    const scene = await sceneFor(true);
    const ent = await room(apartment, `Entrance ${slug('r')}`, 'entrance', 1);
    const liv = await room(apartment, `Living ${slug('r')}`, 'living', 2);
    const bed = await room(apartment, `Bed ${slug('r')}`, 'bedroom', 3);
    await nav(u.owner, scene, [view(ent), view(liv, 2)], [{ a: ent, b: liv, position: [1, 0, 0] }]);
    await nav(
      u.owner,
      scene,
      [view(ent), view(liv, 2), view(bed, -2)],
      [
        { a: liv, b: ent, position: [1, 0, 0] },
        { a: bed, b: ent, position: [-1, 0, 0] },
      ],
    );
    const views = await db.query(
      `select room_id from public.scene_room_views where scene_version_id = $1`,
      [scene],
    );
    const doors = await db.query<{ room_a: string; room_b: string; position: number[] }>(
      `select room_a, room_b, position from public.scene_doorways where scene_version_id = $1 order by position[1]`,
      [scene],
    );
    expect(views.rows).toHaveLength(3);
    expect(doors.rows).toHaveLength(2);
    for (const d of doors.rows) expect(d.room_a < d.room_b).toBe(true);
    expect(doors.rows[0]!.position).toEqual([-1, 0, 0]);
  });

  it('requires an aligned scene and validates rooms, points and pairs', async () => {
    const unaligned = await sceneFor(false);
    const ent = await room(apartment, `E ${slug('r')}`, 'entrance', 1);
    const liv = await room(apartment, `L ${slug('r')}`, 'living', 2);
    expect(await expectError(nav(u.owner, unaligned, [view(ent)], []))).toMatch(/NOT_ALIGNED/);

    const scene = await sceneFor(true);
    // A room of another apartment (same organization).
    const other = await asUser(db, u.owner, async (tx) => {
      const p = await one(
        tx.query<{ id: string }>(
          `insert into public.properties (organization_id, name) values ($1, 'P2') returning id`,
          [org],
        ),
      );
      return (
        await one(
          tx.query<{ id: string }>(
            `insert into public.apartments (property_id, name) values ($1, 'B') returning id`,
            [p.id],
          ),
        )
      ).id;
    });
    const foreign = await room(other, `F ${slug('r')}`, 'living', 1);
    for (const [views, doors] of [
      [[view(foreign)], []],
      [[{ room: ent, position: [50, 1.6, 0], target: [0, 0, 0] }], []], // outside the bounds
      [[{ room: ent, position: [0, 1.6], target: [0, 0, 0] }], []],
      [[view(ent), view(ent)], []], // duplicate room
      [[], [{ a: ent, b: ent, position: [0, 0, 0] }]],
      [[], [{ a: ent, b: foreign, position: [0, 0, 0] }]],
      [[], [{ a: ent, b: 'not-a-uuid', position: [0, 0, 0] }]],
      [
        [],
        [
          { a: ent, b: liv, position: [0, 0, 0] },
          { a: liv, b: ent, position: [1, 0, 0] },
        ],
      ],
      [{}, []],
    ] as const) {
      expect(await expectError(nav(u.owner, scene, views, doors))).toMatch(/VALIDATION_FAILED/);
    }
    // A failed save leaves nothing half-written.
    const n = await db.query(`select 1 from public.scene_room_views where scene_version_id = $1`, [
      scene,
    ]);
    expect(n.rows).toHaveLength(0);
  });

  it('is limited to scan.review in the organization; editors and outsiders cannot write', async () => {
    const scene = await sceneFor(true);
    const ent = await room(apartment, `E2 ${slug('r')}`, 'entrance', 1);
    expect(await expectError(nav(u.editor, scene, [view(ent)], []))).toMatch(/NOT_FOUND/);
    expect(await expectError(nav(u.outsider, scene, [view(ent)], []))).toMatch(/NOT_FOUND/);
    await nav(u.owner, scene, [view(ent)], []);
    const seen = (user: string) =>
      asUser(
        db,
        user,
        async (tx) =>
          (
            await tx.query(`select 1 from public.scene_room_views where scene_version_id = $1`, [
              scene,
            ])
          ).rows.length,
      );
    expect(await seen(u.editor)).toBe(1);
    expect(await seen(u.outsider)).toBe(0);
    expect(
      await expectError(
        asUser(db, u.owner, (tx) =>
          tx.query(`delete from public.scene_room_views where scene_version_id = $1`, [scene]),
        ),
      ),
    ).toMatch(/permission denied/);
  });
});
