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
