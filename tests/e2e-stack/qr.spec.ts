/**
 * Stage 4.4: guest QR codes. Create (token from the database), preview, download SVG/PNG
 * (the PNG decodes to the guest link), revoke with confirmation; revoked codes, other
 * organizations and signed-out requests get no image. Runs against the local Supabase stack.
 */
import { expect, test } from '@playwright/test';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { apartmentWithOrg, expectAccessible, newPerson, run } from './helpers.ts';

test('guest QR codes: create, preview, download, revoke, access control', async ({
  page,
  browser,
}, info) => {
  const tag = `${run}-${info.project.name.startsWith('mobile') ? 'm' : 'd'}`;
  await apartmentWithOrg(page, tag, 'qrowner');

  const section = page.locator('section', {
    has: page.getByRole('heading', { name: 'Guest QR codes' }),
  });
  await expect(section.getByText('No active QR code yet.')).toBeVisible();
  await section.getByLabel('QR code label').fill('Front door sticker');
  await section.getByRole('button', { name: 'Create QR code' }).click();

  const image = section.getByRole('img', { name: 'QR code: Front door sticker' });
  await expect(image).toBeVisible();
  await expect
    .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0);
  const guestLink = await section.getByLabel('Guest link for Front door sticker').inputValue();
  expect(guestLink).toMatch(/^http:\/\/localhost:5173\/a\/[A-Za-z0-9_-]{43}$/);
  await expectAccessible(page);

  // PNG download decodes to exactly the guest link; SVG is an SVG.
  const pngHref = await section.getByRole('link', { name: 'Download PNG' }).getAttribute('href');
  const png = await page.request.get(pngHref!);
  expect(png.status()).toBe(200);
  expect(png.headers()['content-type']).toBe('image/png');
  expect(png.headers()['content-disposition']).toMatch(
    /^attachment; filename="nookscanner-qr-flat-qrowner-.*-front-door-sticker\.png"$/,
  );
  expect(png.headers()['cache-control']).toContain('no-store');
  const decoded = PNG.sync.read(await png.body());
  expect(jsQR(new Uint8ClampedArray(decoded.data), decoded.width, decoded.height)?.data).toBe(
    guestLink,
  );
  const svgHref = await section.getByRole('link', { name: 'Download SVG' }).getAttribute('href');
  const svg = await page.request.get(svgHref!);
  expect(svg.headers()['content-type']).toContain('image/svg+xml');
  expect(await svg.text()).toMatch(/^<svg /);
  // Opened directly, the SVG may not run or load anything.
  expect(svg.headers()['content-security-policy']).toMatch(/^default-src 'none'.*sandbox/);
  expect(svg.headers()['x-content-type-options']).toBe('nosniff');

  // A second code; each code has its own token.
  await section.getByLabel('QR code label').fill('Welcome card');
  await section.getByRole('button', { name: 'Create QR code' }).click();
  const second = section.getByLabel('Guest link for Welcome card');
  await expect(second).toHaveValue(/\/a\/[A-Za-z0-9_-]{43}$/);
  expect(await second.inputValue()).not.toBe(guestLink);

  // Another organization's member and signed-out visitors get nothing.
  const stranger = await newPerson(browser, info);
  await apartmentWithOrg(stranger, tag, 'qrstranger');
  expect((await stranger.request.get(pngHref!)).status()).toBe(404);
  const anonymous = await newPerson(browser, info);
  const anon = await anonymous.request.get(pngHref!, { maxRedirects: 0 });
  expect(anon.status()).toBe(307);
  expect(anon.headers()['location']).toContain('/login');

  // Revoke needs confirmation; afterwards the image is gone.
  await section.getByRole('button', { name: 'Revoke Front door sticker' }).click();
  await expect(section.getByText('Tick the box to confirm.')).toBeVisible();
  await section.getByLabel('Printed copies of Front door sticker will stop working').check();
  await section.getByRole('button', { name: 'Revoke Front door sticker' }).click();
  await expect(section.getByRole('img', { name: 'QR code: Front door sticker' })).toHaveCount(0);
  await expect(section.getByRole('img', { name: 'QR code: Welcome card' })).toBeVisible();
  await expect(section.getByText('Revoked QR codes (1)')).toBeVisible();
  expect((await page.request.get(pngHref!)).status()).toBe(404);
});
