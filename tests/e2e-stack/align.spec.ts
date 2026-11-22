/**
 * Stage 7.3: aligning a REAL captured interior in the dashboard (floor, scale, crop, start view)
 * and storing it. Uses the local-only research scene (KI-029), uploaded to the LOCAL stack's
 * scene-drafts bucket; skipped where the file is missing (CI) and on WebKit (no GPU headless).
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { apartmentWithOrg, run } from './helpers.ts';

const SCENE = 'apps/guest/public/dev-scenes/room-7k.splat';
const DB_URL = process.env.DB_TEST_URL ?? 'postgresql://postgres:postgres@127.0.0.1:56522/postgres';

test.skip(!existsSync(SCENE), 'local research scene missing');

function stackEnv() {
  const out = execSync('npx -y supabase@3.2.0 status -o env', {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const env = Object.fromEntries(
    out
      .split(/\r?\n/)
      .map((l) => /^([A-Z_]+)="?([^"]*)"?$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2]]),
  ) as Record<string, string>;
  return { url: env.API_URL!, serviceKey: env.SERVICE_ROLE_KEY! };
}

/** An approved reconstruction of `apartmentId` whose scene file is the research scene. */
async function approvedScene(apartmentId: string): Promise<{ jobId: string; sessionId: string }> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const { rows: apt } = await client.query<{ organization_id: string }>(
      `select organization_id from public.apartments where id = $1`,
      [apartmentId],
    );
    const org = apt[0]!.organization_id;
    // Two rooms for the navigation step (7.4).
    await client.query(
      `insert into public.rooms (organization_id, apartment_id, name_en, room_type, sort_order)
       values ($1, $2, 'Entrance', 'entrance', 1), ($1, $2, 'Living room', 'living', 2)`,
      [org, apartmentId],
    );
    // One appliance to pin (8.2).
    await client.query(
      `insert into public.appliances (apartment_id, room_id, category_id, name_en)
       select $1, r.id, c.id, 'Living room AC' from public.rooms r, public.appliance_categories c
       where r.apartment_id = $1 and r.name_en = 'Living room' and c.key = 'air_conditioner'`,
      [apartmentId],
    );
    const s = await client.query<{ id: string }>(
      `insert into public.scan_sessions (apartment_id, method, status) values ($1, 'video_upload', 'succeeded') returning id`,
      [apartmentId],
    );
    const j = await client.query<{ id: string }>(
      `insert into public.processing_jobs (organization_id, scan_session_id, apartment_id, idempotency_key, status, attempt)
       values ($1, $2, $3, gen_random_uuid()::text, 'succeeded', 1) returning id`,
      [org, s.rows[0]!.id, apartmentId],
    );
    const jobId = j.rows[0]!.id;
    const path = `org/${org}/apartments/${apartmentId}/scenes/${jobId}/a1/scene.sog`;
    // The viewer detects the format from the file name in the URL; the stored name ends in
    // .sog as the pipeline produces, but this local test file is .splat, so upload it as .splat.
    const splatPath = path.replace(/scene\.sog$/, 'scene.splat');
    const { url, serviceKey } = stackEnv();
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const up = await admin.storage.from('scene-drafts').upload(splatPath, readFileSync(SCENE), {
      contentType: 'application/octet-stream',
      upsert: true,
    });
    if (up.error) throw up.error;
    const report = {
      sfm: {
        registered_ratio: 0.95,
        registered_images: 285,
        input_images: 300,
        mean_reprojection_error_px: 0.7,
      },
      heldout: { frames: 30, psnr: 26.5, ssim: 0.87, lpips: 0.22 },
      files: [
        { path: 'scene.sog', sizeBytes: 36164000, sha256: 'a'.repeat(64), storagePath: splatPath },
      ],
      flags: [],
    };
    await client.query(
      `insert into public.processing_results (organization_id, processing_job_id, report) values ($1, $2, $3)`,
      [org, jobId, JSON.stringify(report)],
    );
    return { jobId, sessionId: s.rows[0]!.id };
  } finally {
    await client.end();
  }
}

test('manager aligns a real 3D scene, sets room viewpoints and a doorway, pins an appliance', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop-chromium', 'needs a GPU-backed browser');
  test.setTimeout(300_000);
  const tag = `${run}-al`;
  const apartmentPath = await apartmentWithOrg(page, tag, 'align');
  const { jobId, sessionId } = await approvedScene(apartmentPath.split('/').pop()!);

  // Approve the reconstruction in the review form, which creates the scene version.
  await page.goto(`/app/scans/${sessionId}`);
  const quality = page.getByRole('region', { name: 'Quality report' });
  await quality.getByRole('button', { name: 'Approve scene' }).click();
  await quality.getByRole('link', { name: 'Align the 3D apartment' }).click();
  await expect(page.getByRole('heading', { name: 'Align the 3D apartment' })).toBeVisible();

  const canvas = page.getByLabel('3D apartment. Drag to look around; tap to place a point.');
  await expect(page.getByText('Points placed: 0 of 3')).toBeVisible({ timeout: 180_000 });
  const box = (await canvas.boundingBox())!;
  // Relative to the canvas (scrolled into view), so later panels changing the layout don't matter.
  const tap = async (fx: number, fy: number) => {
    await canvas.click({ position: { x: box.width * fx, y: box.height * fy } });
  };

  // Floor: three points not on one screen line (a floor seen in perspective).
  for (const [fx, fy] of [
    [0.3, 0.85],
    [0.55, 0.72],
    [0.75, 0.9],
  ] as const) {
    await tap(fx, fy);
  }
  await expect(page.getByText('Points placed: 3 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();

  // Known width: two points on the floor 0.80 m apart (any measured span works).
  await tap(0.4, 0.8);
  await tap(0.6, 0.8);
  // The research scene has no known real size; this value scales it so the taps below make an
  // apartment-sized outline (measured: 2.40 gave 1.3 m x 0.4 m, refused by the tool as too small).
  await page.getByLabel('Measured width (metres)').fill('8.00');
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('alignment-scale')).toContainText('1 scene unit =');

  // Outline: two opposite corners.
  // A too-small outline is refused with an explanation before anything is saved.
  await tap(0.5, 0.8);
  await tap(0.52, 0.81);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Tap two corners on opposite sides' }),
  ).toBeVisible();
  // Real scenes have empty space near the screen edges (taps there are refused with "Nothing
  // there"), so try candidates on each side until the point is placed.
  const placeOne = async (expected: number, candidates: (readonly [number, number])[]) => {
    for (const [fx, fy] of candidates) {
      await tap(fx, fy);
      const placed = page.getByText(`Points placed: ${expected} of 2`);
      if (await placed.isVisible({ timeout: 1_000 }).catch(() => false)) return;
    }
    throw new Error(`no surface hit for corner ${expected}`);
  };
  await placeOne(1, [
    [0.08, 0.95],
    [0.12, 0.9],
    [0.18, 0.88],
    [0.25, 0.85],
  ]);
  await placeOne(2, [
    [0.92, 0.62],
    [0.88, 0.66],
    [0.82, 0.7],
    [0.75, 0.72],
  ]);
  await page.getByRole('button', { name: 'Next' }).click();
  // If the chosen corners are still too close, the tool says so; the scene decides, not the test.
  await expect(page.getByRole('button', { name: 'Save alignment' })).toBeVisible();
  await page.getByRole('button', { name: 'Start here' }).click();
  await page.getByRole('button', { name: 'Save alignment' }).click();
  await expect(page.getByText('Alignment saved.')).toBeVisible();

  // Stage 7.4: viewpoints for both rooms and a doorway; the check names what is missing.
  const nav = page.getByRole('region', { name: 'Rooms and doorways' });
  await expect(nav.getByTestId('nav-check')).toContainText('Entrance has no viewpoint.');
  await nav.getByRole('button', { name: 'Set viewpoint for Entrance here' }).click();
  await canvas.scrollIntoViewIfNeeded();
  const now = (await canvas.boundingBox())!;
  await page.mouse.move(now.x + now.width * 0.5, now.y + now.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(now.x + now.width * 0.3, now.y + now.height * 0.5, { steps: 8 });
  await page.mouse.up();
  await nav.getByRole('button', { name: 'Set viewpoint for Living room here' }).click();
  await expect(nav.getByTestId('nav-check')).toContainText(
    'Living room cannot be reached from the entrance.',
  );
  await nav.getByLabel('Doorway from').selectOption({ label: 'Entrance' });
  await nav.getByLabel('to').selectOption({ label: 'Living room' });
  await nav.getByRole('button', { name: 'Add doorway' }).click();
  await expect(nav.getByRole('button', { name: 'Tap the doorway in the 3D view' })).toBeVisible();
  // Doorway: a point inside the outline (the tool refuses points outside it).
  for (const [fx, fy] of [
    [0.5, 0.75],
    [0.45, 0.8],
    [0.55, 0.85],
    [0.4, 0.7],
    [0.6, 0.7],
    [0.5, 0.65],
    [0.35, 0.85],
    [0.65, 0.8],
  ] as const) {
    if (await nav.getByRole('button', { name: 'Add doorway' }).isVisible()) break;
    await tap(fx, fy);
  }
  await expect(nav.getByTestId('nav-check')).toContainText(
    'Every room has a viewpoint and can be reached from the entrance.',
  );
  await nav.getByRole('button', { name: 'Save rooms and doorways' }).click();
  await expect(nav.getByText('Rooms and doorways saved.')).toBeVisible();

  // Stage 8.2: pin the appliance by tapping the scene; the marker is drawn back where tapped
  // (pick -> aligned metres -> database -> projection), i.e. the point round-trips.
  const hs = page.getByRole('region', { name: 'Hotspots' });
  await hs.getByRole('button', { name: 'Place Living room AC in 3D' }).click();
  await expect(hs.getByText('Tap Living room AC in the 3D view')).toBeVisible();
  // The research scene has no true floor (its "floor" taps are guesses), so which screen points
  // lie inside the aligned apartment is not known in advance: scan a grid. Points outside are
  // refused by the database and the tool keeps waiting for the next tap.
  let tapped: { x: number; y: number } | null = null;
  const pinned = hs.getByText('Living room AC pinned.');
  scan: for (let fy = 0.2; fy <= 0.9; fy += 0.1) {
    for (let fx = 0.1; fx <= 0.9; fx += 0.1) {
      await tap(fx, fy);
      await page.waitForTimeout(400);
      if (await pinned.isVisible()) {
        tapped = { x: box.width * fx, y: box.height * fy };
        break scan;
      }
    }
  }
  expect(tapped).not.toBeNull();
  const marker = page.getByTestId('hotspot-marker');
  await expect(marker).toHaveCount(1);
  const markerAt = async () =>
    marker.evaluate((el) => {
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec((el as HTMLElement).style.transform);
      return m ? { x: Number(m[1]), y: Number(m[2]) } : null;
    });
  await expect.poll(markerAt).not.toBeNull();
  const drawn = (await markerAt())!;
  expect(Math.hypot(drawn.x - tapped!.x, drawn.y - tapped!.y)).toBeLessThan(4);
  await expect(hs).toContainText('Living room AC · Living room · pinned');
  // 8.4: a manager confirms the pin; the status changes.
  await hs.getByRole('button', { name: 'Verify pin of Living room AC' }).click();
  await expect(hs.getByText('Living room AC pin verified.')).toBeVisible();
  await expect(hs).toContainText('Living room AC · Living room · pinned, verified');

  // Survives a reload; then remove the pin.
  await page.reload();
  await expect(hs.getByRole('button', { name: 'Move Living room AC' })).toBeVisible({
    timeout: 180_000,
  });
  await expect(page.getByTestId('hotspot-marker')).toHaveCount(1);
  await hs.getByRole('button', { name: 'Remove pin of Living room AC' }).click();
  await expect(hs.getByText('Living room AC unpinned.')).toBeVisible();
  await expect(page.getByTestId('hotspot-marker')).toHaveCount(0);

  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{
      status: string;
      alignment: { matrix: number[]; scale: number };
      bounds: { min: number[]; max: number[] };
      start_view: unknown;
    }>(
      `select status::text, alignment, bounds, start_view from public.scene_versions where processing_job_id = $1`,
      [jobId],
    );
    const r = rows[0]!;
    expect(r.status).toBe('approved');
    expect(r.alignment.matrix).toHaveLength(16);
    expect(r.alignment.scale).toBeGreaterThan(0);
    expect(r.bounds.min[1]).toBe(0);
    expect(r.start_view).not.toBeNull();
    const views = await client.query(
      `select v.position from public.scene_room_views v join public.scene_versions s on s.id = v.scene_version_id where s.processing_job_id = $1`,
      [jobId],
    );
    const doors = await client.query(
      `select d.position from public.scene_doorways d join public.scene_versions s on s.id = d.scene_version_id where s.processing_job_id = $1`,
      [jobId],
    );
    expect(views.rows).toHaveLength(2);
    for (const v of views.rows as { position: number[] }[]) expect(v.position[1]).toBe(1.5);
    expect(doors.rows).toHaveLength(1);
  } finally {
    await client.end();
  }
  await page.screenshot({ path: `test-results/align-${info.project.name}.png` });
});
