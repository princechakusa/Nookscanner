/**
 * Stage 5.1: walkthrough video upload in parts of at most 45 MiB (ADR-016) with TUS.
 * Survives a network drop mid-upload, and an interrupted upload resumes after a reload with the
 * same file without re-sending finished parts. Runs against the local Supabase stack.
 */
import { expect, test, type Page } from '@playwright/test';
import { apartmentWithOrg, expectAccessible, run } from './helpers.ts';

const PART = 47185920;
/** Two parts: 45 MiB + 1 MiB. Random-looking bytes; content is validated in Stage 5.2. */
function video(name: string) {
  const buffer = Buffer.alloc(PART + 1024 * 1024);
  for (let i = 0; i < buffer.length; i += 4096) buffer[i] = (i / 4096) % 251;
  return { name, mimeType: 'video/mp4', buffer };
}

async function openUpload(page: Page, apartmentPath: string) {
  await page.goto(apartmentPath);
  await page.getByRole('link', { name: 'Upload a walkthrough video' }).click();
  await expect(page.getByRole('heading', { name: 'Upload a walkthrough video' })).toBeVisible();
}

/** Counts TUS requests (creation POST and data PATCH) to the resumable endpoint. */
function trackTus(page: Page) {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/storage/v1/upload/resumable') && ['POST', 'PATCH'].includes(r.method()))
      seen.push(r.method());
  });
  return seen;
}

test('video upload in parts survives a network drop', async ({ page, context }, info) => {
  test.setTimeout(180_000);
  const tag = `${run}-${info.project.name.startsWith('mobile') ? 'm' : 'd'}`;
  const apartment = await apartmentWithOrg(page, tag, 'upload');
  await openUpload(page, apartment);
  await expectAccessible(page);

  // Wrong type is refused before anything is sent.
  await page.getByLabel('Walkthrough video').setInputFiles({
    name: 'notes.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF'),
  });
  await expect(page.getByText('Choose an MP4 or MOV video.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload video' })).toBeDisabled();

  // The first two data requests fail as if the connection dropped; TUS retries them.
  let dropped = 0;
  await page.route('**/storage/v1/upload/resumable/**', async (route) => {
    if (route.request().method() === 'PATCH' && dropped < 2) {
      dropped += 1;
      return route.abort('internetdisconnected');
    }
    return route.continue();
  });

  await page.getByLabel('Walkthrough video').setInputFiles(video('walk.mp4'));
  await expect(page.getByText('walk.mp4: 46 MB')).toBeVisible();
  await page.getByRole('button', { name: 'Upload video' }).click();
  const progress = page.getByRole('progressbar', { name: 'Upload progress' });
  await expect(progress).toBeVisible();

  // Go fully offline for a few seconds in the middle of the upload.
  await expect.poll(async () => Number(await progress.getAttribute('value'))).toBeGreaterThan(10);
  await context.setOffline(true);
  await page.waitForTimeout(4000);
  await context.setOffline(false);

  await expect(page.getByText('Upload complete.')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByText('arrived in 2 parts')).toBeVisible();
  expect(dropped).toBe(2);

  // Nothing is left to resume.
  await page.reload();
  await expect(page.getByText('Unfinished uploads')).toHaveCount(0);
});

test('an interrupted upload resumes after a reload without re-sending finished parts', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const tag = `${run}-${info.project.name.startsWith('mobile') ? 'm' : 'd'}`;
  const apartment = await apartmentWithOrg(page, tag, 'resume');
  await openUpload(page, apartment);

  // Hold the second part's creation request, then leave the page: part 1 is stored and recorded.
  let creations = 0;
  let secondPartStarted!: () => void;
  const started = new Promise<void>((resolve) => (secondPartStarted = resolve));
  await page.route('**/storage/v1/upload/resumable', async (route) => {
    if (route.request().method() === 'POST' && ++creations === 2) return secondPartStarted();
    return route.continue();
  });
  await page.getByLabel('Walkthrough video').setInputFiles(video('resume.mp4'));
  await page.getByRole('button', { name: 'Upload video' }).click();
  await started;
  // Reload while the request is still held (removing the route first would let it through).
  await page.reload();
  await page.unrouteAll({ behavior: 'ignoreErrors' });

  // The unfinished upload is offered; a different file is refused.
  await page.getByLabel(/Resume resume\.mp4/).check();
  await page.getByLabel('Walkthrough video').setInputFiles(video('other.mp4'));
  await expect(page.getByText('This is not the same file as the unfinished upload')).toBeVisible();

  const tus = trackTus(page);
  await page.getByLabel('Walkthrough video').setInputFiles(video('resume.mp4'));
  await page.getByRole('button', { name: 'Resume upload' }).click();
  await expect(page.getByText('Upload complete.')).toBeVisible({ timeout: 120_000 });
  // Only the second part (1 MiB: one creation request carrying the data) was sent after the reload.
  expect(tus).toEqual(['POST']);
  await page.reload();
  await expect(page.getByText('Unfinished uploads')).toHaveCount(0);
});
