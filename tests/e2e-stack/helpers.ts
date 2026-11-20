/** Shared helpers for stack E2E specs (Mailpit-driven auth). */
import { expect, type Page } from '@playwright/test';

export const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:56524';
export const run = Math.random().toString(36).slice(2, 8);
export const PASSWORD = 'Apartment2026';
export const NEW_PASSWORD = 'Apartment2027x';

/**
 * Exact dashboard URLs. Emailed links end in `next=/app`, so a loose `/\/app$/` already matches the
 * confirm page and the test would move on before the confirm POST (which sets the session cookie)
 * finished, aborting it (KNOWN_ISSUES R-020, formerly KI-022).
 */
export const at = (path: string) =>
  new RegExp(`^http://localhost:3000${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);

export interface MailSummary {
  ID: string;
  Subject: string;
}

export async function latestLink(email: string, subject: RegExp): Promise<string> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const res = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const body = (await res.json()) as { messages: MailSummary[] };
    const msg = body.messages.find((m) => subject.test(m.Subject));
    if (msg) {
      const full = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as {
        HTML: string;
      };
      const href = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(full.HTML)?.[1];
      if (!href) throw new Error('no confirm link in email');
      return href.replace(/&amp;/g, '&');
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no email "${subject}" for ${email}`);
}

export async function signIn(page: Page, email: string, password: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export async function signOut(page: Page) {
  // On phones the sidebar is a drawer behind the menu button.
  const menu = page.getByRole('button', { name: 'Open navigation' });
  // The sidebar is a drawer below the md breakpoint (768 px).
  if ((page.viewportSize()?.width ?? 1024) < 768) {
    // Retry until hydrated and the drawer reports itself open.
    await expect(async () => {
      if ((await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
      await expect(menu).toHaveAttribute('aria-expanded', 'true', { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  }
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(at('/login'));
}

export async function signUpAndConfirm(page: Page, email: string) {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Test Manager');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  const link = await latestLink(email, /Confirm your Nookscanner account/);
  await page.goto(link);
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page).toHaveURL(at('/app'));
  return link;
}
