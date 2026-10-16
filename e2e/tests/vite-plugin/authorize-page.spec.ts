import { expect, test as base } from '@playwright/test';

/**
 * Behaviour of the authorize page itself, independent of a client library,
 * both as served by the dev server and as written to the build output.
 */
const test = base.extend<{
  authorizeUrl: (params: Record<string, string>) => string;
}>({
  authorizeUrl: async ({ baseURL }, use) => {
    await use(
      (params) =>
        `authorize?${new URLSearchParams({
          response_type: 'code',
          client_id: 'mock-oidc-e2e',
          redirect_uri: new URL('callback', baseURL).href,
          state: 'test-state',
          ...params,
        })}`,
    );
  },
});

test('validates the claims with the zod schema before signing in', async ({ page, authorizeUrl }) => {
  await page.goto(authorizeUrl({}));
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

test('supports custom subjects', async ({ page, authorizeUrl }) => {
  await page.goto(authorizeUrl({}));
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
  await page.goto(authorizeUrl({}));
  await expect(page.getByLabel('User')).toHaveValue('');
  await expect(page.getByLabel('Subject')).toHaveValue('carol');
});

test('answers prompt=none from the provider session', async ({ page, authorizeUrl }) => {
  await page.goto(authorizeUrl({ prompt: 'none', response_mode: 'fragment' }));
  await expect(page).toHaveURL(/\/callback#error=login_required&.*state=test-state$/);

  await page.goto(authorizeUrl({}));
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.goto(authorizeUrl({ prompt: 'none' }));
  await expect(page).toHaveURL(/\/callback\?code=mock-oidc\.[^&]+&state=test-state$/);
});

test('rejects redirects to other origins', async ({ page, authorizeUrl }) => {
  await page.goto(authorizeUrl({ redirect_uri: 'https://example.com/callback' }));
  await expect(page.getByRole('alert')).toHaveText(
    'The mock OIDC redirect origin is not allowed: https://example.com',
  );
});
