/**
 * Stage 9.2: a QR link (/a/<token>) loads the published apartment through guest-experience. The
 * function is intercepted here (its own tests run against the database: supabase/tests); this
 * checks the guest app's side on mobile emulation: the payload renders, an inactive link and
 * rate limiting are explained in EN/AR, and no credentials are sent.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The preview server sends the production CSP (apps/guest/public/_headers): any violation fails.
test.beforeEach(({ page }) => {
  page.on('console', (m) => {
    const text = m.text();
    if (m.type() === 'error' && /Content Security Policy|violates|Refused to/i.test(text)) {
      throw new Error(`CSP violation: ${text.slice(0, 200)}`);
    }
  });
});

const TOKEN = 'T'.repeat(43);
const PAYLOAD = {
  apartment: { name: { en: 'Marina 12B', ar: 'مارينا 12B' }, property: { en: 'Marina Tower' } },
  rooms: [
    { id: 'liv', type: 'living', name: { en: 'Living room', ar: 'غرفة المعيشة' } },
    { id: 'kit', type: 'kitchen', name: { en: 'Kitchen', ar: 'المطبخ' } },
  ],
  appliances: [
    {
      id: 'ac',
      roomId: 'liv',
      category: 'air_conditioner',
      name: { en: 'Living room AC', ar: 'مكيف غرفة المعيشة' },
      aliases: { en: ['ac'], ar: ['مكيف'] },
      verified: true,
      steps: [{ text: { en: 'Press **Power** on the remote', ar: 'اضغط **تشغيل**' } }],
      troubleshooting: [],
    },
  ],
  support: { whatsapp: '971501234567' },
};

async function axe(page: Page) {
  const r = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .disableRules(['color-contrast'])
    .analyze();
  expect(r.violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);
}

test('a QR link shows the published apartment; credentials are never sent', async ({ page }) => {
  let seen: { url: string; cookie: string | null; auth: string | null } | null = null;
  await page.route('**/guest-experience?**', async (route) => {
    const req = route.request();
    seen = {
      url: req.url(),
      cookie: await req.headerValue('cookie'),
      auth: await req.headerValue('authorization'),
    };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(PAYLOAD),
    });
  });
  await page.goto(`/a/${TOKEN}`);
  await expect(page.getByRole('heading', { level: 1, name: /Marina 12B/ })).toBeVisible();
  expect(seen!.url).toContain(`/guest-experience?t=${TOKEN}`);
  expect(seen!.cookie).toBeNull();
  expect(seen!.auth).toBeNull();
  await page
    .getByRole('button', { name: /Living room AC/ })
    .first()
    .click();
  const sheet = page.locator('dialog[open]');
  await expect(sheet.locator('strong')).toHaveText('Power');
  await axe(page);
});

test('an inactive link and rate limiting are explained, in English and Arabic', async ({
  page,
}) => {
  let status = 404;
  await page.route('**/guest-experience?**', (route) =>
    route.fulfill({
      status,
      contentType: 'application/json',
      headers: status === 429 ? { 'retry-after': '60' } : {},
      body: status === 404 ? '{"error":"NOT_FOUND"}' : '{"error":"RATE_LIMITED"}',
    }),
  );
  await page.goto(`/a/${TOKEN}`);
  await expect(page.getByRole('alert')).toContainText('This link is not active');
  await expect(page.getByRole('button', { name: 'Try again' })).toHaveCount(0);
  await page.getByRole('button', { name: /Switch to Arabic/ }).click();
  await expect(page.getByRole('alert')).toContainText('هذا الرابط غير مفعّل');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await axe(page);

  status = 429;
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('يرجى الانتظار قليلًا');
  status = 200;
  await page.unroute('**/guest-experience?**');
  await page.route('**/guest-experience?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) }),
  );
  await page.getByRole('button', { name: 'حاول مرة أخرى' }).click();
  await expect(page.getByRole('heading', { level: 1, name: /مارينا 12B/ })).toBeVisible();
});

test('the instruction sheet shows photos from Storage under the CSP; support opens WhatsApp (9.4)', async ({
  page,
}) => {
  // 1x1 PNG served as if from the project's Storage (signed URL), which the CSP allows.
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  );
  const photo =
    'https://nfcnckwjrwpofkrzribd.supabase.co/storage/v1/object/sign/instruction-media/x.png?token=t';
  await page.route('**/guest-experience?**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) }),
  );
  await page.route('**/guest-instruction?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        applianceId: 'ac',
        media: [{ kind: 'image', url: photo, caption: { en: 'The remote', ar: 'جهاز التحكم' } }],
      }),
    }),
  );
  await page.route(photo, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: png }),
  );
  await page.goto(`/a/${TOKEN}`);
  await page
    .getByRole('button', { name: /Living room AC/ })
    .first()
    .click();
  const sheet = page.locator('dialog[open]');
  const img = sheet.getByRole('img', { name: 'The remote' });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(1);
  const support = sheet.getByRole('link', { name: /Contact/ });
  await expect(support).toHaveAttribute('href', 'https://wa.me/971501234567');
  await axe(page);
});

test('without WebGL a published 3D apartment falls back to the list and never downloads the scene (9.5)', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      if (type === 'webgl2' || type === 'webgl') return null;
      return (original as (...a: unknown[]) => unknown).call(this, type, ...rest) as never;
    } as typeof original;
  });
  const sceneUrl =
    'https://nfcnckwjrwpofkrzribd.supabase.co/storage/v1/object/sign/scene-drafts/s.sog?token=t';
  let sceneRequested = false;
  await page.route(sceneUrl, (route) => {
    sceneRequested = true;
    return route.abort();
  });
  await page.route('**/guest-experience?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...PAYLOAD,
        appliances: [
          ...PAYLOAD.appliances,
          {
            ...PAYLOAD.appliances[0],
            id: 'oven',
            roomId: 'kit',
            category: 'oven',
            name: { en: 'Oven', ar: 'الفرن' },
            aliases: { en: [], ar: [] },
          },
        ],
        scene: {
          url: sceneUrl,
          sizeBytes: 40_000_000,
          hotspots: [{ applianceId: 'ac', position: [0, 1, -2] }],
        },
      }),
    }),
  );
  await page.route('**/guest-instruction?**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '{"applianceId":"ac","media":[]}',
    }),
  );
  await page.goto(`/a/${TOKEN}`);
  await expect(page.getByRole('status').filter({ hasText: /3D/ }).first()).toBeVisible();
  // Every room, each with its appliances, without choosing a room first.
  await expect(page.getByRole('heading', { level: 3, name: 'Living room' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 3, name: 'Kitchen' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Oven/ })).toBeVisible();
  await page
    .getByRole('button', { name: /Living room AC/ })
    .first()
    .click();
  await expect(page.locator('dialog[open]').locator('strong')).toHaveText('Power');
  await expect(page.locator('canvas')).toHaveCount(0);
  expect(sceneRequested).toBe(false);
  await axe(page);
});
