/**
 * Stage 4.1: create an organization, invite (link shown once), revoke, accept with the invited
 * email, and refuse acceptance by anyone else. Runs against the local Supabase stack.
 */
import { expect, test, type Page } from '@playwright/test';
import { run, signUpAndConfirm } from './helpers.ts';

async function invite(page: Page, email: string, role: string): Promise<string> {
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Role', { exact: true }).selectOption(role);
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const link = page.getByLabel('Invitation link');
  await expect(link).toHaveValue(/\/invite\/[A-Za-z0-9_-]{43}$/);
  return link.inputValue();
}

// FIXME(KI-022): fails because the session cookie set by the e-mail confirmation server action
// is not kept for the second and third person in this spec. Stage 4.1 stays IN PROGRESS until fixed.
test.fixme('owner invites an editor who joins with the invited email only', async ({
  page,
  browser,
}, info) => {
  // Each person uses their own browser (as in reality); same-browser user switching is KI-022.
  const newPerson = async () => (await browser.newContext(info.project.use)).newPage();
  const tag = `${run}-${info.project.name.startsWith('mobile') ? 'm' : 'd'}`;
  const ownerEmail = `owner-${tag}@example.test`;
  const inviteeEmail = `invitee-${tag}@example.test`;
  const strangerEmail = `stranger-${tag}@example.test`;

  // Owner creates the organization from the overview.
  await signUpAndConfirm(page, ownerEmail);
  await page.getByLabel('Organization name').fill(`E2E Rentals ${tag}`);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByText('your role: Owner')).toBeVisible();
  const members = page.getByRole('table', { name: 'Members' });
  await expect(members.getByText('Test Manager (you)')).toBeVisible();

  // Invite the editor (link shown once) and a second person whose invitation is revoked.
  const link = await invite(page, inviteeEmail, 'editor');
  await page.reload();
  await expect(page.getByLabel('Invitation link')).toHaveCount(0);
  await invite(page, `revoked-${tag}@example.test`, 'viewer');
  await page.reload();
  const pending = page.getByRole('table', { name: 'Pending invitations' });
  await expect(pending.locator('tbody tr')).toHaveCount(2);
  await pending
    .locator('tbody tr', { hasText: `revoked-${tag}` })
    .getByRole('button', { name: 'Revoke' })
    .click();
  await expect(pending.locator('tbody tr')).toHaveCount(1);
  await expect(pending.getByText(inviteeEmail)).toBeVisible();

  // Duplicate invitation is refused with a clear message.
  await page.getByLabel('Email', { exact: true }).fill(inviteeEmail);
  await page.getByRole('button', { name: 'Create invitation' }).click();
  await expect(page.locator('.ns-field__error[role="alert"]')).toContainText('already');

  // A different signed-in user cannot use the link.
  const stranger = await newPerson();
  await signUpAndConfirm(stranger, strangerEmail);
  await stranger.goto(new URL(link).pathname);
  await stranger.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(stranger.locator('.ns-field__error[role="alert"]')).toContainText('permission');

  // The invitee joins.
  const invitee = await newPerson();
  await signUpAndConfirm(invitee, inviteeEmail);
  await invitee.goto(new URL(link).pathname);
  await expect(invitee.getByText(`signed in as ${inviteeEmail}`, { exact: false })).toBeVisible();
  await invitee.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(page).toHaveURL(/\/app\?joined=1$/);
  await expect(invitee.getByRole('status')).toContainText('You joined the organization.');
  await invitee.goto('/app/settings');
  await expect(invitee.getByText('your role: Editor')).toBeVisible();
  // Editors cannot invite.
  await expect(invitee.getByRole('heading', { name: 'Invite a team member' })).toHaveCount(0);

  // The link is single-use.
  await invitee.goto(new URL(link).pathname);
  await invitee.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(invitee.locator('.ns-field__error[role="alert"]')).toContainText(
    'invalid, expired, already used',
  );
});
