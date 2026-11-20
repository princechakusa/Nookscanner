/**
 * Stage 4.3: rooms are created from the layout questionnaire, reordered, renamed, added and
 * deleted; layout changes add only the missing rooms. Runs against the local Supabase stack.
 */
import { expect, test } from '@playwright/test';
import { at, expectAccessible, run, signUpAndConfirm } from './helpers.ts';

test('rooms from the layout: create, reorder, rename, add, delete, top up', async ({
  page,
}, info) => {
  const tag = `${run}-${info.project.name.startsWith('mobile') ? 'm' : 'd'}`;
  await signUpAndConfirm(page, `rooms-${tag}@example.test`);
  await page.getByLabel('Organization name').fill(`Rooms ${tag}`);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(at('/app/settings'));

  await page.goto('/app/properties');
  await page.getByLabel('Property name').fill(`Rooms Tower ${tag}`);
  await page.getByRole('button', { name: 'Create property' }).click();
  await expect(page).toHaveURL(/\/app\/properties\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: 'Add apartment' }).click();
  await page.getByLabel('Apartment name').fill(`Rooms Flat ${tag}`);
  await page.getByLabel('Bedrooms').fill('2');
  await page.getByRole('button', { name: 'Create apartment' }).click();
  await expect(page).toHaveURL(/\/app\/apartments\/[0-9a-f-]{36}$/);

  // Planned list -> real rooms.
  await expect(page.getByRole('list', { name: 'Planned rooms' }).getByRole('listitem')).toHaveCount(
    7,
  );
  await page.getByRole('button', { name: 'Create these rooms' }).click();
  const rooms = page.getByRole('list', { name: 'Rooms' });
  const names = rooms.locator('.ns-rooms__en');
  await expect(names).toHaveText([
    'Entrance',
    'Living room',
    'Kitchen',
    'Hallway',
    'Bedroom 1',
    'Bedroom 2',
    'Bathroom',
  ]);
  await expect(page.getByRole('button', { name: 'Move Entrance up' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Move Bathroom down' })).toBeDisabled();
  await expectAccessible(page);

  // Reorder: bathroom before bedroom 2; survives a reload.
  await page.getByRole('button', { name: 'Move Bathroom up' }).click();
  await expect(names.nth(5)).toHaveText('Bathroom');
  await page.reload();
  await expect(names).toHaveText([
    'Entrance',
    'Living room',
    'Kitchen',
    'Hallway',
    'Bedroom 1',
    'Bathroom',
    'Bedroom 2',
  ]);

  // Rename with an Arabic name.
  const item = rooms.getByRole('listitem').filter({ hasText: 'Bedroom 2' });
  await item.getByText('Edit Bedroom 2').click();
  await item.getByLabel('Name (English)').fill('Guest bedroom');
  await item.getByLabel('Name (Arabic)').fill('غرفة الضيوف');
  await item.getByRole('button', { name: 'Save Bedroom 2' }).click();
  await expect(names.nth(6)).toHaveText('Guest bedroom');
  await expect(rooms.getByRole('listitem').nth(6)).toContainText('غرفة الضيوف');
  await expect(rooms.getByRole('listitem').first()).toContainText('المدخل');

  // Add a custom room; duplicates are refused and the input is kept.
  const add = page.locator('form', { has: page.getByRole('button', { name: 'Add room' }) });
  await add.getByLabel('Name (English)').fill('Kitchen');
  await add.getByLabel('Type').selectOption('kitchen');
  await add.getByRole('button', { name: 'Add room' }).click();
  await expect(add.getByText('This apartment already has a room with this name.')).toBeVisible();
  await expect(add.getByLabel('Name (English)')).toHaveValue('Kitchen');
  await add.getByLabel('Name (English)').fill('Pantry');
  await add.getByLabel('Type').selectOption('storage');
  await add.getByRole('button', { name: 'Add room' }).click();
  await expect(names.last()).toHaveText('Pantry');

  // Delete the hallway.
  await page.getByRole('button', { name: 'Delete Hallway' }).click();
  await expect(names).toHaveText([
    'Entrance',
    'Living room',
    'Kitchen',
    'Bedroom 1',
    'Bathroom',
    'Guest bedroom',
    'Pantry',
  ]);

  // Layout change: only missing rooms are added (hallway, bedroom 2, balcony).
  await page.getByLabel('Balconies').fill('1');
  await page.getByRole('button', { name: 'Save apartment' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Apartment saved.' })).toBeVisible();
  await page.getByRole('button', { name: 'Add 3 missing rooms from the layout' }).click();
  await expect(names).toHaveText([
    'Entrance',
    'Living room',
    'Kitchen',
    'Bedroom 1',
    'Bathroom',
    'Guest bedroom',
    'Pantry',
    'Hallway',
    'Bedroom 2',
    'Balcony',
  ]);
  await expect(page.getByRole('button', { name: /missing room/ })).toHaveCount(0);
  await expectAccessible(page);
});
