/**
 * Stage 8.1: appliances of an apartment, room by room: add (with validation that keeps the
 * input), edit and move to another room, delete; the organization-wide list. Local stack.
 */
import { expect, test } from '@playwright/test';
import { at, expectAccessible, run, signUpAndConfirm } from './helpers.ts';

test('appliances: add, validate, edit, move room, delete, organization list', async ({
  page,
}, info) => {
  const tag = `${run}-${info.project.name.startsWith('mobile') ? 'm' : 'd'}`;
  await signUpAndConfirm(page, `appl-${tag}@example.test`);
  await page.getByLabel('Organization name').fill(`Appl ${tag}`);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(at('/app/settings'));

  await page.goto('/app/properties');
  await page.getByLabel('Property name').fill(`Appl Tower ${tag}`);
  await page.getByRole('button', { name: 'Create property' }).click();
  await page.getByRole('link', { name: 'Add apartment' }).click();
  await page.getByLabel('Apartment name').fill(`Appl Flat ${tag}`);
  await page.getByLabel('Bedrooms').fill('1');
  await page.getByRole('button', { name: 'Create apartment' }).click();
  await expect(page).toHaveURL(/\/app\/apartments\/[0-9a-f-]{36}$/);
  const apartmentUrl = page.url();

  const section = page.getByRole('region', { name: 'Appliances' });
  await expect(section).toContainText('Create the rooms first');
  await page.getByRole('button', { name: 'Create these rooms' }).click();
  await expect(section).toContainText('No appliances yet');

  const add = section.getByRole('form', { name: 'Add appliance' });
  // Validation: no name -> error, the brand typed so far is kept.
  await add.getByLabel('Brand').fill('Daikin');
  await add.getByRole('button', { name: 'Add appliance' }).click();
  await expect(add.getByText('Enter a name.')).toBeVisible();
  await expect(add.getByLabel('Brand')).toHaveValue('Daikin');

  await add.getByLabel('Room', { exact: true }).selectOption({ label: 'Living room' });
  await add.getByLabel('Kind of appliance').selectOption({ label: 'Air conditioner' });
  await add.getByLabel('Name (English)').fill('Living room AC');
  await add.getByLabel('Name (Arabic)').fill('مكيف غرفة المعيشة');
  await add.getByLabel('Model number').fill('FTXM35R');
  await add.getByRole('button', { name: 'Add appliance' }).click();
  const living = section.getByRole('list', { name: 'Appliances in Living room' });
  await expect(living).toContainText('Living room AC');
  await expect(living).toContainText('Air conditioner · Daikin · FTXM35R');

  await add.getByLabel('Room', { exact: true }).selectOption({ label: 'Kitchen' });
  await add.getByLabel('Kind of appliance').selectOption({ label: 'Oven' });
  await add.getByLabel('Name (English)').fill('Oven');
  await add.getByLabel('Brand').fill('');
  await add.getByLabel('Model number').fill('');
  await add.getByLabel('Name (Arabic)').fill('');
  await add.getByRole('button', { name: 'Add appliance' }).click();
  await expect(section.getByRole('list', { name: 'Appliances in Kitchen' })).toContainText('Oven');
  await expectAccessible(page);

  // Edit: rename and move the AC to the bedroom; survives a reload.
  await living.getByText('Edit Living room AC').click();
  const edit = living.locator('details');
  await edit.getByLabel('Name (English)').fill('Bedroom AC');
  await edit.getByLabel('Room', { exact: true }).selectOption({ label: 'Bedroom' });
  await edit.getByRole('button', { name: 'Save Living room AC' }).click();
  // Wait for the server action (the row moves to the bedroom) before reloading; CI is slower.
  await expect(section.getByRole('list', { name: 'Appliances in Bedroom' })).toContainText(
    'Bedroom AC',
  );
  await page.reload();
  await expect(section.getByRole('list', { name: 'Appliances in Bedroom' })).toContainText(
    'Bedroom AC',
  );
  await expect(section.getByRole('list', { name: 'Appliances in Living room' })).toHaveCount(0);

  // Organization-wide list links back to the apartment.
  await page.goto('/app/appliances');
  const all = page.getByRole('list', { name: 'All appliances' });
  await expect(all.getByRole('listitem')).toHaveCount(2);
  await expect(all).toContainText('Bedroom AC');
  await all.getByRole('link', { name: /Appl Flat .* · Bedroom/ }).click();
  await expect(page).toHaveURL(apartmentUrl);

  // Delete.
  await section.getByRole('button', { name: 'Delete Oven' }).click();
  await expect(section.getByRole('list', { name: 'Appliances in Kitchen' })).toHaveCount(0);
  await expect(section.getByRole('list', { name: 'Appliances in Bedroom' })).toContainText(
    'Bedroom AC',
  );
});
