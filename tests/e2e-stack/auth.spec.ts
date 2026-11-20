/**
 * Stage 2.4: dashboard auth flows end to end against the local Supabase stack
 * (signup -> email confirmation -> sign in/out -> password reset), emails read from Mailpit.
 * Run with `npm run test:e2e:stack` (scripts/e2e-stack.mjs).
 */
import { expect, test } from '@playwright/test';
import {
  NEW_PASSWORD,
  PASSWORD,
  at,
  latestLink,
  run,
  signIn,
  signOut,
  signUpAndConfirm,
} from './helpers.ts';

test('signed-out visitors are sent to sign-in, keeping the target path', async ({ page }) => {
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('sign-up validates the password policy on the server', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('Weak');
  await page.getByLabel('Work email').fill(`weak-${run}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill('password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Use at least 10 characters.')).toBeVisible();
});

test('sign up, confirm by email, sign out, sign in; links are single-use', async ({ page }) => {
  const email = `manager-${run}@example.test`;
  const response = await page.goto('/signup');
  const csp = response?.headers()['content-security-policy'] ?? '';
  expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
  expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);

  const link = await signUpAndConfirm(page, email);
  await expect(page.getByTestId('signed-in-email')).toContainText(email);
  await expect(page.getByRole('heading', { name: 'Welcome, Test Manager' })).toBeVisible();

  // Signed-in users skip auth pages.
  await page.goto('/login');
  await expect(page).toHaveURL(at('/app'));

  await signOut(page);
  await page.goto('/app');
  await expect(page).toHaveURL(/\/login/);

  // Reusing the confirmation link fails.
  await page.goto(link);
  await page.getByRole('button', { name: 'Confirm email' }).click();
  await expect(page.locator('.nt-form-error')).toContainText('invalid or has expired');

  await signIn(page, email, 'WrongPassword1');
  await expect(page.locator('.nt-form-error')).toContainText('Email or password is incorrect.');
  await signIn(page, email, PASSWORD);
  await expect(page).toHaveURL(at('/app'));
});

test('unknown accounts get the same sign-in error (no enumeration)', async ({ page }) => {
  await signIn(page, `nobody-${run}@example.test`, 'WrongPassword1');
  await expect(page.locator('.nt-form-error')).toContainText('Email or password is incorrect.');
});

test('post-login redirect cannot leave the site (open redirect)', async ({ page }) => {
  const email = `redirect-${run}@example.test`;
  await signUpAndConfirm(page, email);
  await signOut(page);
  await signIn(page, email, PASSWORD, 'https://evil.example/phish');
  await expect(page).toHaveURL(/^http:\/\/localhost:3000\/app$/);
});

test('password reset by email', async ({ page }) => {
  const email = `reset-${run}@example.test`;
  await signUpAndConfirm(page, email);
  await signOut(page);

  // Same answer for unknown and known addresses.
  for (const address of [`ghost-${run}@example.test`, email]) {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill(address);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText('If an account exists');
  }

  await page.goto(await latestLink(email, /Reset your Nookscanner password/));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(at('/reset-password'));
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Repeat new password').fill('Mismatch2026x');
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page.getByText('The passwords do not match.')).toBeVisible();
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel('Repeat new password').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Save password' }).click();
  await expect(page).toHaveURL(/\/app\?password=updated$/);
  await expect(page.getByRole('status')).toContainText('Your password was updated.');

  await signOut(page);
  await signIn(page, email, PASSWORD);
  await expect(page.locator('.nt-form-error')).toContainText('Email or password is incorrect.');
  await signIn(page, email, NEW_PASSWORD);
  await expect(page).toHaveURL(at('/app'));
});
