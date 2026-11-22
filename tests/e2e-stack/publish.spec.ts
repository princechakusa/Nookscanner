/**
 * Stage 8.5: publishing from the apartment page. The 3D-heavy parts (alignment, viewpoints, pins)
 * are covered by align.spec.ts; here they are seeded into the LOCAL database, then the manager
 * sees what blocks publishing, verifies the instructions, publishes, republishes and unpublishes.
 */
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { apartmentWithOrg, run } from './helpers.ts';

const DB_URL = process.env.DB_TEST_URL ?? 'postgresql://postgres:postgres@127.0.0.1:56522/postgres';

/** Rooms, an aligned approved scene with viewpoints + doorway, an AC with EN text and a verified pin. */
async function seed(apartmentId: string): Promise<{ applianceId: string }> {
  const c = new pg.Client({ connectionString: DB_URL });
  await c.connect();
  try {
    const q = async <T = { id: string }>(sql: string, params: unknown[] = []) =>
      (await c.query(sql, params)).rows[0] as T;
    const { organization_id: org } = await q<{ organization_id: string }>(
      `select organization_id from public.apartments where id = $1`,
      [apartmentId],
    );
    const entrance = await q(
      `insert into public.rooms (apartment_id, name_en, room_type, sort_order) values ($1, 'Entrance', 'entrance', 1) returning id`,
      [apartmentId],
    );
    const living = await q(
      `insert into public.rooms (apartment_id, name_en, room_type, sort_order) values ($1, 'Living room', 'living', 2) returning id`,
      [apartmentId],
    );
    const s = await q(
      `insert into public.scan_sessions (apartment_id, method, status) values ($1, 'video_upload', 'succeeded') returning id`,
      [apartmentId],
    );
    const j = await q(
      `insert into public.processing_jobs (organization_id, scan_session_id, apartment_id, idempotency_key, status, attempt)
       values ($1, $2, $3, gen_random_uuid()::text, 'succeeded', 1) returning id`,
      [org, s.id, apartmentId],
    );
    const scene = await q(
      `insert into public.scene_versions (organization_id, apartment_id, processing_job_id, version, status, scene_path, alignment, bounds, start_view)
       values ($1, $2, $3, 1, 'approved', $4,
               '{"matrix":[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],"scale":1}',
               '{"min":[-3,0,-4],"max":[3,2.6,4]}',
               '{"position":[0,1.5,3],"target":[0,1.5,0]}') returning id`,
      [org, apartmentId, j.id, `org/${org}/apartments/${apartmentId}/scenes/${j.id}/a1/scene.sog`],
    );
    for (const [room, x] of [
      [entrance.id, 0],
      [living.id, 1],
    ] as const) {
      await c.query(
        `insert into public.scene_room_views (organization_id, scene_version_id, room_id, position, target) values ($1, $2, $3, $4, $5)`,
        [org, scene.id, room, [x, 1.5, 0], [x, 1.5, -1]],
      );
    }
    const [a, b] = [entrance.id, living.id].sort();
    await c.query(
      `insert into public.scene_doorways (organization_id, scene_version_id, room_a, room_b, position) values ($1, $2, $3, $4, '{0.5,0,0}')`,
      [org, scene.id, a, b],
    );
    const ac = await q(
      `insert into public.appliances (apartment_id, room_id, category_id, name_en)
       select $1, $2, c.id, 'Living room AC' from public.appliance_categories c where c.key = 'air_conditioner' returning id`,
      [apartmentId, living.id],
    );
    const ins = await q(`insert into public.instructions (appliance_id) values ($1) returning id`, [
      ac.id,
    ]);
    await c.query(
      `insert into public.instruction_versions (instruction_id, locale, version, title, steps) values ($1, 'en', 1, 'Cooling', '[{"text":"Press Power"}]')`,
      [ins.id],
    );
    const h = await q(
      `insert into public.hotspots (scene_version_id, appliance_id, position) values ($1, $2, '{1,1.2,-1}') returning id`,
      [scene.id, ac.id],
    );
    // The pin is verified here (its UI is covered by align.spec.ts).
    await c.query(`select set_config('nookscanner.verifying', 'on', false)`);
    await c.query(
      `update public.hotspots set verification_status = 'verified', verified_at = now() where id = $1`,
      [h.id],
    );
    return { applianceId: ac.id };
  } finally {
    await c.end();
  }
}

test('publish: blocked with reasons, verify, publish, republish, unpublish', async ({
  page,
}, info) => {
  const tag = `${run}-${info.project.name.startsWith('mobile') ? 'm' : 'd'}`;
  const path = await apartmentWithOrg(page, tag, 'pub');
  const { applianceId } = await seed(path.split('/').pop()!);
  await page.reload();

  const panel = page.getByRole('region', { name: 'Publish' });
  await expect(panel.getByTestId('publish-state')).toHaveText(
    'Not published yet. Guests cannot open it.',
  );
  await expect(panel.getByRole('list', { name: 'Publishing blocked by' })).toHaveText(
    'Living room AC has no verified English instructions.',
  );
  await expect(panel.getByRole('button', { name: 'Publish' })).toBeDisabled();

  await page.goto(`/app/appliances/${applianceId}`);
  await page.getByRole('button', { name: 'Verify English version 1' }).click();
  await expect(page.getByTestId('preview-en')).toContainText('verified');

  await page.goto(path);
  await expect(panel.getByRole('status')).toContainText('Ready: 3D version 1');
  await panel.getByRole('button', { name: 'Publish' }).click();
  await expect(panel.getByTestId('publish-state')).toHaveText(
    'Published · version 1. Guests with a QR code see it.',
  );
  await panel.getByRole('button', { name: 'Publish again' }).click();
  await expect(panel.getByTestId('publish-state')).toContainText('Published · version 2.');
  await panel.getByRole('button', { name: 'Unpublish now' }).click();
  await expect(panel.getByTestId('publish-state')).toHaveText(
    'Not published (last published version 2). Guests cannot open it.',
  );
});
