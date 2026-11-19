/**
 * Stage 3.4: guest shell on mobile emulation (Pixel 7 Chromium, iPhone 15 WebKit), EN + AR.
 * Screenshots are written to test-results/screens for visual review against docs/design mockups.
 */
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

async function expectAccessible(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    // Glass panels over the (future) 3D canvas: contrast is verified on tokens
    // (viewer.text on viewer.background) because axe cannot resolve backdrop blur.
    .disableRules(['color-contrast'])
    .analyze();
  expect(result.violations.map((v) => `${v.id} (${v.nodes.length})`)).toEqual([]);
}

const shot = (page: Page, name: string, project: string) =>
  page.screenshot({ path: `test-results/screens/${project}-${name}.png`, fullPage: false });

test('demo apartment in English: rooms, search, instruction sheet', async ({ page }, info) => {
  await page.goto('/demo');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo apartment');
  await shot(page, 'en-home', info.project.name);
  await expectAccessible(page);

  await page.getByLabel('Search appliances').fill('ac');
  const results = page.getByRole('region', { name: 'Search appliances' });
  await expect(results.getByRole('button')).toHaveCount(2);
  await expect(results.getByRole('button').nth(1)).toContainText('Bedroom 1');
  await shot(page, 'en-search', info.project.name);

  await results.getByRole('button', { name: /Living room AC/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Living room AC' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Verified')).toBeVisible();
  await sheet.getByText('Not cooling?').click();
  await expect(sheet.getByText(/close the windows/)).toBeVisible();
  await shot(page, 'en-sheet', info.project.name);
  await expectAccessible(page);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
});

test('demo apartment in Arabic is right-to-left', async ({ page }, info) => {
  await page.goto('/demo');
  await page.getByRole('button', { name: 'عربي' }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('شقة تجريبية');
  await shot(page, 'ar-home', info.project.name);
  await expectAccessible(page);

  await page
    .getByRole('button', { name: /مكيف غرفة المعيشة/ })
    .first()
    .click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'مكيف غرفة المعيشة' })).toBeVisible();
  await expect(sheet.getByRole('link', { name: /تواصل معنا/ })).toBeVisible();
  // RTL: the close button sits on the left edge of the sheet.
  const close = await sheet.getByRole('button', { name: 'إغلاق' }).boundingBox();
  const box = await sheet.boundingBox();
  expect(close && box && close.x < box.x + box.width / 2).toBe(true);
  await shot(page, 'ar-sheet', info.project.name);
});

test('without WebGL the guest gets every appliance by room', async ({ page }, info) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error test override of an overloaded DOM method
    HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
      if (type === 'webgl2' || type === 'webgl') return null;
      // @ts-expect-error forwarding overloaded arguments
      return original.call(this, type, ...rest);
    };
  });
  await page.goto('/demo');
  await expect(page.getByRole('status')).toContainText('cannot show the 3D apartment');
  for (const room of ['Living room', 'Kitchen', 'Bedroom 1']) {
    await expect(page.getByRole('heading', { level: 3, name: room })).toBeVisible();
  }
  await shot(page, 'en-fallback', info.project.name);
});
