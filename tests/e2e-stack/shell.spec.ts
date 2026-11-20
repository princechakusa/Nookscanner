/**
 * Stage 3.3: dashboard shell (sidebar, breadcrumbs, collapse, mobile drawer) and accessibility
 * scans with axe in a real browser (WCAG 2.2 AA rule set).
 */
import { expect, test } from '@playwright/test';
import { expectAccessible, run, signUpAndConfirm } from './helpers.ts';

test('auth pages pass axe (WCAG 2.2 AA)', async ({ page }) => {
  for (const path of ['/login', '/signup', '/forgot-password']) {
    await page.goto(path);
    await expectAccessible(page);
  }
});

test('signed-in shell: navigation, breadcrumbs, accessibility', async ({ page, isMobile }) => {
  await signUpAndConfirm(page, `shell-${run}-${isMobile ? 'm' : 'd'}@example.test`);
  await expect(page.getByRole('heading', { name: 'Welcome, Test Manager' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Set up your organization' })).toBeVisible();
  await expectAccessible(page);

  if (isMobile) {
    const menu = page.getByRole('button', { name: 'Open navigation' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    // Closed drawer must not be reachable by keyboard or screen readers.
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
    await expect(async () => {
      if ((await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
      await expect(menu).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  }
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link')).toHaveCount(7);
  await expect(nav.getByRole('link', { name: 'Overview' })).toHaveAttribute('aria-current', 'page');

  await nav.getByRole('link', { name: 'Apartments' }).click();
  await expect(page).toHaveURL(/\/app\/apartments$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Apartments' })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Breadcrumb' }).getByText('Apartments'),
  ).toHaveAttribute('aria-current', 'page');
  await expectAccessible(page);

  if (!isMobile) {
    // Collapse keeps accessible names and survives a reload.
    await page.getByRole('button', { name: 'Collapse navigation' }).click();
    await expect(nav.getByRole('link', { name: 'Scans' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Expand navigation' })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole('button', { name: 'Expand navigation' }).click();
  }
});
