import { expect, test as base } from '@playwright/test';
import { expectAnonymous, libraries } from '../libraries';

/**
 * Behaviour of the authorize page itself, independent of a client library,
 * both on the dev server and in the static build.
 *
 * The MSW worker serves the page to navigations from a page that runs it, so
 * every test opens an app page before it navigates to the authorize URL.
 */
const test = base.extend<{
  openAuthorizePage: (params: Record<string, string>) => Promise<void>;
}>({
  openAuthorizePage: async ({ baseURL, page }, use) => {
    await use(async (params) => {
      await page.goto(libraries[0].path);
      await expectAnonymous(page);
      await page.goto(
        `authorize?${new URLSearchParams({
          response_type: 'code',
          client_id: 'mock-oidc-e2e',
          redirect_uri: new URL('callback', baseURL).href,
          state: 'test-state',
          ...params,
        })}`,
      );
    });
  },
});

test('validates the claims with the zod schema before signing in', async ({ page, openAuthorizePage }) => {
  await openAuthorizePage({});
  await page.getByLabel('Name').fill('');
  await page.getByLabel('E-mail', { exact: true }).fill('not-an-email');
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByRole('alert')).toHaveCount(2);
  await expect(page).toHaveURL(/\/authorize\?/);

  await page.getByLabel('Name').fill('Valid Name');
  await page.getByLabel('E-mail', { exact: true }).fill('valid@example.com');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/callback\?code=mock-oidc\.[^&]+&state=test-state$/);
});

test('edits nested objects and arrays of objects', async ({ page, openAuthorizePage }) => {
  await openAuthorizePage({});
  await page.getByLabel('User').selectOption({ label: 'Bob (editor, admin)' });

  await page.getByRole('group', { name: 'Address' }).getByLabel('City').fill('Ghent');

  const tenantList = page.getByRole('group', { name: 'Tenants', exact: true });
  const tenants = page.getByRole('group', { name: 'Tenants item', exact: true });
  await expect(tenantList.getByText('Tenants the user can access')).toBeVisible();
  await expect(tenants).toHaveCount(2);

  // The remaining tenant moves up with its own values, and a new tenant
  // starts empty instead of with the removed tenant's values.
  await tenantList.getByRole('button', { name: 'Remove' }).first().click();
  await expect(tenants.first().getByLabel('Tenant ID')).toHaveValue('globex');
  await tenantList.getByRole('button', { name: 'Add' }).click();
  await expect(tenants.nth(1).getByLabel('Tenant ID')).toHaveValue('');

  // A tenant without permissions is rejected by the zod schema.
  await tenants.nth(1).getByLabel('Tenant ID').fill('initech');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(tenants.nth(1).getByRole('alert')).toBeVisible();

  const permissions = tenants.nth(1).getByRole('group', { name: 'Permissions' });
  await permissions.getByLabel('read').check();
  await permissions.getByLabel('write').check();
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/callback\?code=/);

  expect(
    await page.evaluate(() =>
      JSON.parse(sessionStorage.getItem('mock.oidc.claims') ?? 'null'),
    ),
  ).toMatchObject({
    address: { street_address: 'Grote Markt 1', locality: 'Ghent', country: 'BE' },
    tenants: [
      { id: 'globex', permissions: ['billing'] },
      { id: 'initech', permissions: ['read', 'write'] },
    ],
  });
});

test('supports custom subjects', async ({ page, openAuthorizePage }) => {
  await openAuthorizePage({});
  await page.getByLabel('User').selectOption({ label: 'Custom user' });
  await expect(page.getByLabel('Subject')).toHaveValue('');
  await page.getByLabel('Subject').fill('carol');
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/callback\?code=/);

  expect(
    await page.evaluate(() => ({
      subject: sessionStorage.getItem('mock.oidc.subject'),
      claims: JSON.parse(sessionStorage.getItem('mock.oidc.claims') ?? 'null'),
    })),
  ).toEqual({
    subject: 'carol',
    claims: expect.objectContaining({ name: 'Alice Example', roles: ['reader'] }),
  });

  // The page restores the previous selection on the next sign-in.
  await openAuthorizePage({});
  await expect(page.getByLabel('User')).toHaveValue('');
  await expect(page.getByLabel('Subject')).toHaveValue('carol');
});

test('answers prompt=none from the provider session', async ({ page, openAuthorizePage }) => {
  await openAuthorizePage({ prompt: 'none', response_mode: 'fragment' });
  await expect(page).toHaveURL(/\/callback#error=login_required&.*state=test-state$/);

  await openAuthorizePage({});
  await page.getByRole('button', { name: 'Log in' }).click();
  await openAuthorizePage({ prompt: 'none' });
  await expect(page).toHaveURL(/\/callback\?code=mock-oidc\.[^&]+&state=test-state$/);
});

test('rejects redirects to other origins', async ({ page, openAuthorizePage }) => {
  await openAuthorizePage({ redirect_uri: 'https://example.com/callback' });
  await expect(page.getByRole('alert')).toHaveText(
    'The mock OIDC redirect origin is not allowed: https://example.com',
  );
});
