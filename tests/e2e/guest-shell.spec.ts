import { expect, test } from '@playwright/test';

test('guest root asks the guest to scan the QR code', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /scan the qr code/i })).toBeVisible();
});

test('guest can switch to Arabic (RTL)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /switch to arabic/i }).click();
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
});

test('a malformed token never shows the loading state', async ({ page }) => {
  await page.goto('/a/short');
  await expect(page.getByRole('heading', { name: /scan the qr code/i })).toBeVisible();
});
