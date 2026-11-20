/**
 * Stages 6.2/6.3 manager flow: submit an uploaded scan for 3D processing, follow the job's progress,
 * read the quality report and review it. The GPU worker is simulated through the same database
 * functions the job-callback Edge Function calls (private.claim_processing_jobs /
 * private.apply_job_event), so everything except the GPU itself is real.
 */
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { apartmentWithOrg, at, expectAccessible, run } from './helpers.ts';

const DB_URL = process.env.DB_TEST_URL ?? 'postgresql://postgres:postgres@127.0.0.1:56522/postgres';

/** Creates an uploaded scan (one fully stored part) the way the upload flow leaves it. */
async function uploadedScan(email: string, apartmentId: string): Promise<string> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ id: string }>(
      `select id from auth.users where email = $1`,
      [email],
    );
    const user = rows[0]!.id;
    await client.query('begin');
    await client.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify({ sub: user, role: 'authenticated' }),
    ]);
    await client.query('set local role authenticated');
    const s = await client.query<{ id: string }>(
      `insert into public.scan_sessions (apartment_id, method) values ($1, 'video_upload') returning id`,
      [apartmentId],
    );
    const up = await client.query<{ id: string }>(
      `select id from public.register_media_upload($1, 'walkthrough.mp4', 'video/mp4', 4000000)`,
      [s.rows[0]!.id],
    );
    await client.query('commit');
    // Storage confirmed the part (as complete_media_upload_part does after the object exists).
    await client.query(
      `update public.media_upload_parts set status = 'uploaded', uploaded_at = now() where media_upload_id = $1`,
      [up.rows[0]!.id],
    );
    await client.query(`update public.media_uploads set status = 'uploaded' where id = $1`, [
      up.rows[0]!.id,
    ]);
    await client.query(`update public.scan_sessions set status = 'uploaded' where id = $1`, [
      s.rows[0]!.id,
    ]);
    return s.rows[0]!.id;
  } finally {
    await client.end();
  }
}

/** Plays the worker for the job of `sessionId`: claim, progress, then the given outcome. */
async function worker(sessionId: string, steps: Array<'claim' | number | 'succeeded'>) {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    for (const step of steps) {
      const { rows } = await client.query<{ id: string; attempt: number }>(
        `select id, attempt from public.processing_jobs where scan_session_id = $1 order by created_at desc limit 1`,
        [sessionId],
      );
      const job = rows[0]!;
      if (step === 'claim') {
        await client.query(
          `update public.processing_jobs set next_attempt_at = now() where id = $1`,
          [job.id],
        );
        await client.query(`select * from private.claim_processing_jobs(20)`);
      } else if (typeof step === 'number') {
        await client.query(
          `select private.apply_job_event($1, $2, 'progress', 'training', $3, null, null, false, null)`,
          [job.id, job.attempt, step],
        );
      } else {
        const report = {
          sfm: {
            registered_ratio: 0.94,
            registered_images: 282,
            input_images: 300,
            mean_reprojection_error_px: 0.71,
          },
          heldout: { frames: 30, psnr: 26.3, ssim: 0.88, lpips: 0.21, gaussians: 2400000 },
          flags: [],
        };
        await client.query(
          `select private.apply_job_event($1, $2, 'succeeded', null, null, null, null, false, $3::jsonb)`,
          [job.id, job.attempt, JSON.stringify(report)],
        );
      }
    }
  } finally {
    await client.end();
  }
}

test('submit a scan, follow processing, review the quality report', async ({ page }, info) => {
  test.setTimeout(180_000);
  const tag = `${run}-${info.project.name.startsWith('mobile') ? 'm' : 'd'}`;
  const apartmentPath = await apartmentWithOrg(page, tag, 'scans');
  const apartmentId = apartmentPath.split('/').pop()!;
  const sessionId = await uploadedScan(`scans-${tag}@example.test`, apartmentId);

  // The scan appears in the list, ready to process.
  await page.goto('/app/scans');
  const list = page.getByRole('table', { name: 'Scans' });
  await expect(list.getByText('Ready to process')).toBeVisible();
  await list.getByRole('link').first().click();
  await expect(page).toHaveURL(at(`/app/scans/${sessionId}`));
  await expect(page.getByText('walkthrough.mp4')).toBeVisible();
  await expectAccessible(page);

  // Submit: a queued job appears; the page refreshes itself while it runs.
  await page.getByRole('button', { name: 'Create 3D apartment' }).click();
  const processing = page.getByRole('region', { name: '3D processing' });
  await expect(processing.getByText('Queued')).toBeVisible();
  await worker(sessionId, ['claim', 40]);
  await expect(processing.getByText('Building the 3D apartment')).toBeVisible({ timeout: 15_000 });
  await expect(processing.getByText('40%')).toBeVisible();

  // Finished: the quality report is shown against the targets.
  await worker(sessionId, ['succeeded']);
  const quality = page.getByRole('region', { name: 'Quality report' });
  await expect(quality).toBeVisible({ timeout: 15_000 });
  const table = quality.getByRole('table', { name: 'Quality measurements' });
  await expect(table.getByRole('row', { name: /Cameras placed.*94\.0%.*Good/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /PSNR.*26\.30 dB.*Good/ })).toBeVisible();
  await expect(quality.getByText('282 of 300 frames placed')).toBeVisible();
  await expectAccessible(page);

  // Rejecting needs notes; approving records the checklist.
  await quality.getByRole('button', { name: 'Needs a new capture' }).click();
  await expect(quality.getByText('Explain what is wrong')).toBeVisible();
  await quality.getByLabel('Floating blobs in the air').check();
  await quality.getByRole('button', { name: 'Approve scene' }).click();
  await expect(quality.getByText('Approved')).toBeVisible();
  await expect(quality.getByRole('list', { name: 'Problems noted' })).toContainText(
    'Floating blobs in the air',
  );
  await page.goto('/app/scans');
  await expect(page.getByRole('table', { name: 'Scans' }).getByText('3D ready')).toBeVisible();
});
