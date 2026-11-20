/**
 * Stage 4.2: property + apartment CRUD with the layout questionnaire, and a property-scoped
 * manager who only sees (and can only add to) the property they were assigned.
 * Runs against the local Supabase stack.
 */
import { expect, test, type Page } from '@playwright/test';
import { at, expectAccessible, newPerson, run, signUpAndConfirm } from './helpers.ts';

async function createProperty(page: Page, name: string): Promise<string> {
  await page.goto('/app/properties');
  await page.getByLabel('Property name').fill(name);
  await page.getByLabel('City').fill('Dubai');
  await page.getByLabel('Country code').fill('ae');
  await page.getByRole('button', { name: 'Create property' }).click();
  await expect(page).toHaveURL(/\/app\/properties\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  return new URL(page.url()).pathname;
}

async function fillApartment(
  page: Page,
  name: string,
  counts: { bedrooms: string; bathrooms: string; balconies: string },
) {
  await page.getByLabel('Apartment name').fill(name);
  await page.getByLabel('Unit number').fill('1204');
  await page.getByLabel('Bedrooms').fill(counts.bedrooms);
  await page.getByLabel('Bathrooms').fill(counts.bathrooms);
  await page.getByLabel('Balconies').fill(counts.balconies);
}

test('properties and apartments CRUD; property-scoped manager sees only assigned', async ({
  page,
  browser,
}, info) => {
  // Multi-person flow with ~50 browser actions; WebKit on Windows needs ~2 s per action.
  test.slow();
  const tag = `${run}-${info.project.name.startsWith('mobile') ? 'm' : 'd'}`;
  const towerA = `Tower A ${tag}`;
  const towerB = `Tower B ${tag}`;

  await signUpAndConfirm(page, `propowner-${tag}@example.test`);
  await page.getByLabel('Organization name').fill(`Props ${tag}`);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page).toHaveURL(at('/app/settings'));

  // Server-side validation mirrors the DB checks.
  await page.goto('/app/properties');
  await expect(page.getByText('No properties yet')).toBeVisible();
  await page.getByLabel('Property name').fill(towerA);
  await page.getByLabel('Country code').fill('1');
  await page.getByLabel('Guest support email').fill('not-an-email');
  await page.getByRole('button', { name: 'Create property' }).click();
  await expect(page.getByText('Use the two-letter country code')).toBeVisible();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  // What was typed survives the failed submit (R-021).
  await expect(page.getByLabel('Property name')).toHaveValue(towerA);
  await expectAccessible(page);

  const pathA = await createProperty(page, towerA);
  const pathB = await createProperty(page, towerB);

  // Edit property details.
  await page.goto(pathA);
  await page.getByLabel('Address').fill('1 Marina Walk');
  await page.getByRole('button', { name: 'Save property' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Property saved.' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Address')).toHaveValue('1 Marina Walk');

  // Apartment with the layout questionnaire; rooms are planned from it.
  await page.getByRole('link', { name: 'Add apartment' }).click();
  await expect(page).toHaveURL(/\/app\/apartments\/new\?property=/);
  await expect(page.getByLabel('Property')).toHaveValue(pathA.split('/').pop()!);
  await fillApartment(page, `Marina View ${tag}`, {
    bedrooms: '11',
    bathrooms: '2',
    balconies: '1',
  });
  await page.getByRole('button', { name: 'Create apartment' }).click();
  await expect(page.getByText('Enter a whole number within the allowed range.')).toBeVisible();
  await expect(page.getByLabel('Apartment name')).toHaveValue(`Marina View ${tag}`);
  await expectAccessible(page);
  await page.getByLabel('Bedrooms').fill('2');
  await page.getByRole('button', { name: 'Create apartment' }).click();
  await expect(page).toHaveURL(/\/app\/apartments\/[0-9a-f-]{36}$/);
  const apartmentA = new URL(page.url()).pathname;
  const rooms = page.getByRole('list', { name: 'Planned rooms' });
  await expect(rooms.getByRole('listitem')).toHaveText([
    'Entrance',
    'Living room',
    'Kitchen',
    'Hallway',
    'Bedroom 1',
    'Bedroom 2',
    'Bathroom 1',
    'Bathroom 2',
    'Balcony',
  ]);

  // Update: studio with an open kitchen.
  await page.getByLabel('Bedrooms').fill('0');
  await page.getByLabel('Bathrooms').fill('1');
  await page.getByLabel('Kitchen').selectOption('open');
  await page.getByRole('button', { name: 'Save apartment' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Apartment saved.' })).toBeVisible();
  await page.reload();
  await expectAccessible(page);
  await expect(rooms.getByRole('listitem')).toHaveText([
    'Entrance',
    'Living room',
    'Hallway',
    'Bathroom',
    'Balcony',
  ]);

  // A second apartment in tower B.
  await page.goto(`/app/apartments/new?property=${pathB.split('/').pop()}`);
  await fillApartment(page, `Creek Loft ${tag}`, { bedrooms: '1', bathrooms: '1', balconies: '0' });
  await page.getByRole('button', { name: 'Create apartment' }).click();
  await expect(page).toHaveURL(/\/app\/apartments\/[0-9a-f-]{36}$/);
  const apartmentB = new URL(page.url()).pathname;

  await page.goto('/app/apartments');
  const list = page.getByRole('table', { name: 'Apartments' });
  await expect(list.getByRole('link')).toHaveText([`Creek Loft ${tag}`, `Marina View ${tag}`]);
  await expect(list.getByText('Studio · 1 bathroom · 1 balcony')).toBeVisible();
  await expectAccessible(page);
  await page.goto(pathA);
  await expectAccessible(page);

  // Invite a manager limited to tower A.
  const managerEmail = `propmgr-${tag}@example.test`;
  await page.goto('/app/settings');
  await page.getByLabel('Email', { exact: true }).fill(managerEmail);
  await page.getByLabel('Role', { exact: true }).selectOption('manager');
  await page.getByLabel('Access').selectOption('properties');
  await page.getByLabel(towerA).check();
  await page.getByRole('button', { name: 'Create invitation' }).click();
  const link = await page.getByLabel('Invitation link').inputValue();

  const manager = await newPerson(browser, info);
  await signUpAndConfirm(manager, managerEmail);
  await manager.goto(new URL(link).pathname);
  await manager.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(manager).toHaveURL(at('/app?joined=1'));

  await manager.goto('/app/properties');
  const visible = manager.getByRole('table', { name: 'Properties' });
  await expect(visible.getByRole('link')).toHaveText([towerA]);
  // Managers cannot create properties (admin permission).
  await expect(manager.getByRole('button', { name: 'Create property' })).toHaveCount(0);
  await manager.goto('/app/apartments');
  await expect(manager.getByRole('table', { name: 'Apartments' }).getByRole('link')).toHaveText([
    `Marina View ${tag}`,
  ]);
  // The other property and its apartment do not exist for this person.
  for (const path of [pathB, apartmentB]) {
    const res = await manager.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  // A manager can add apartments, but only to the assigned property.
  await manager.goto('/app/apartments/new');
  await expect(manager.getByLabel('Property').locator('option')).toHaveText([towerA]);
  await manager.goto(apartmentA);
  await expect(manager.getByRole('button', { name: 'Save apartment' })).toBeVisible();
  await expect(manager.getByRole('button', { name: 'Delete apartment' })).toHaveCount(0);

  // Deleting needs explicit confirmation.
  await page.goto(apartmentB);
  await page.getByRole('button', { name: 'Delete apartment' }).click();
  await expect(page.getByText('Tick the box to confirm.')).toBeVisible();
  await page.getByLabel('I understand that this deletes the apartment').check();
  await page.getByRole('button', { name: 'Delete apartment' }).click();
  await expect(page).toHaveURL(at('/app/apartments?deleted=1'));
  await expect(page.getByRole('table', { name: 'Apartments' }).getByRole('link')).toHaveText([
    `Marina View ${tag}`,
  ]);

  await page.goto(pathB);
  await page.getByLabel('I understand that this deletes the property and its apartments').check();
  await page.getByRole('button', { name: 'Delete property' }).click();
  await expect(page).toHaveURL(at('/app/properties?deleted=1'));
  await expect(page.getByRole('table', { name: 'Properties' }).getByRole('link')).toHaveText([
    towerA,
  ]);
});
