/**
 * Stage 8.3: instructions per appliance in English and Arabic; every save is a new, unverified
 * version; formatting renders safely (injected HTML stays text); a photo uploads to the private
 * bucket, displays under the CSP via a signed URL, and can be deleted. Local stack.
 */
import { deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { at, expectAccessible, run, signUpAndConfirm } from './helpers.ts';

/** A valid 64x48 PNG, so the browser really decodes it. */
function png(): Buffer {
  const w = 64;
  const h = 48;
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // RGB
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = 30;
      raw[o + 1] = 120 + y;
      raw[o + 2] = 140;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('instructions: EN/AR versions, safe formatting, photo upload and delete', async ({
  page,
}, info) => {
  const tag = `${run}-${info.project.name.startsWith('mobile') ? 'm' : 'd'}`;
  await signUpAndConfirm(page, `ins-${tag}@example.test`);
  await page.getByLabel('Organization name').fill(`Ins ${tag}`);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(at('/app/settings'));
  await page.goto('/app/properties');
  await page.getByLabel('Property name').fill(`Ins Tower ${tag}`);
  await page.getByRole('button', { name: 'Create property' }).click();
  await page.getByRole('link', { name: 'Add apartment' }).click();
  await page.getByLabel('Apartment name').fill(`Ins Flat ${tag}`);
  await page.getByRole('button', { name: 'Create apartment' }).click();
  await page.getByRole('button', { name: 'Create these rooms' }).click();
  const add = page.getByRole('form', { name: 'Add appliance' });
  await add.getByLabel('Room', { exact: true }).selectOption({ label: 'Living room' });
  await add.getByLabel('Name (English)').fill('Living room AC');
  await add.getByRole('button', { name: 'Add appliance' }).click();
  await page.getByRole('link', { name: 'Instructions for Living room AC' }).click();
  await expect(page.getByRole('heading', { name: 'Living room AC', level: 1 })).toBeVisible();

  // English: validation keeps the input, then save with formatting and an injection attempt.
  const en = page.getByRole('form', { name: 'Instructions in English' });
  await en.getByLabel('Title (English)').fill('Turn on cooling');
  await en.getByRole('button', { name: 'Save English instructions' }).click();
  await expect(en.getByText('Write at least one step.')).toBeVisible();
  await expect(en.getByLabel('Title (English)')).toHaveValue('Turn on cooling');
  await en
    .getByLabel('Steps, one per line (English)')
    .fill(
      '1. Press **Power** on the remote\n2. Choose *Cool*\n3. <img src=x onerror="window.__pwned=1"> [manual](javascript:alert(1))',
    );
  await en.getByLabel('Problem 1').fill('No cold air');
  await en.getByLabel('Solution 1').fill('Close the windows and wait **5 minutes**.');
  await en.getByRole('button', { name: 'Save English instructions' }).click();
  const preview = page.getByTestId('preview-en');
  await expect(preview).toContainText('Version 1 of 1 · not verified yet');
  await expect(preview.locator('strong').first()).toHaveText('Power');
  await expect(preview).toContainText('<img src=x onerror="window.__pwned=1">');
  await expect(preview.locator('img')).toHaveCount(0);
  await expect(preview.locator('a')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBe(
    undefined,
  );

  // A second save is version 2 (append-only).
  await page.getByText('Edit English instructions').click();
  await en.getByLabel('Title (English)').fill('Turn on cooling (24 °C)');
  await en.getByRole('button', { name: 'Save English instructions' }).click();
  await expect(preview).toContainText('Version 2 of 2');
  await expect(preview).toContainText('Turn on cooling (24 °C)');

  // Arabic, right-to-left.
  const ar = page.getByRole('form', { name: 'Instructions in Arabic' });
  await ar.getByLabel('Title (Arabic)').fill('تشغيل التبريد');
  await ar.getByLabel('Steps, one per line (Arabic)').fill('اضغط زر **التشغيل**\nاختر التبريد');
  await ar.getByRole('button', { name: 'Save Arabic instructions' }).click();
  const arPreview = page.getByTestId('preview-ar');
  await expect(arPreview).toContainText('Version 1 of 1');
  await expect(arPreview).toHaveAttribute('dir', 'rtl');
  await expectAccessible(page);

  // Photo upload: private bucket, shown through a signed URL that the CSP allows.
  const upload = page.getByRole('form', { name: 'Add photo or video' });
  await upload.getByLabel(/Photo or short video/).setInputFiles({
    name: 'remote.png',
    mimeType: 'image/png',
    buffer: png(),
  });
  await upload.getByLabel('Caption (English)').fill('The remote');
  await upload.getByRole('button', { name: 'Upload' }).click();
  await expect(upload.getByText('remote.png added.')).toBeVisible();
  const thumb = page.getByRole('list', { name: 'Instruction media' }).getByRole('img', {
    name: 'The remote',
  });
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(64);

  // Wrong type is refused in the browser before upload.
  await upload.getByLabel(/Photo or short video/).setInputFiles({
    name: 'x.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await upload.getByRole('button', { name: 'Upload' }).click();
  await expect(upload.getByText(/Use a JPEG, PNG or WebP photo/)).toBeVisible();

  await page.getByRole('button', { name: 'Delete The remote' }).click();
  await expect(page.getByRole('list', { name: 'Instruction media' })).toHaveCount(0);
});
