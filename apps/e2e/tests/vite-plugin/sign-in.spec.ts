import { expect, test } from '@playwright/test';
import { expectAnonymous, libraries, readClaims } from '../libraries';

/**
 * The development flow: the app's MSW worker mocks the provider endpoints and
 * the Vite plugin serves the AutoForm based authorize page.
 */
for (const library of libraries) {
  test.describe(library.name, () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(library.path);
      await expectAnonymous(page);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveTitle('Mock OIDC login');
    });

    test('signs in as a configured user', async ({ page }) => {
      await page.getByLabel('User').selectOption({ label: 'Bob (editor, admin)' });
      await expect(page.getByLabel('Subject')).toHaveValue('bob');
      await page.getByRole('button', { name: 'Log in' }).click();

      await expect(page).toHaveURL(new RegExp(`${library.path}$`));
      await expect(page.getByTestId('subject')).toHaveText('bob');
      expect(await readClaims(page)).toMatchObject({
        sub: 'bob',
        name: 'Bob Example',
        email: 'bob@example.com',
        roles: ['editor', 'admin'],
        email_verified: true,
        address: { locality: 'Antwerp', country: 'BE' },
        tenants: [
          { id: 'acme', permissions: ['read', 'write'] },
          { id: 'globex', permissions: ['billing'] },
        ],
      });
    });

    test('signs in with claims edited in the form', async ({ page }) => {
      await page.getByLabel('Name').fill('Alice Edited');
      const roles = page.getByRole('group', { name: 'Roles' });
      await roles.getByLabel('reader').uncheck();
      await roles.getByLabel('admin').check();
      await page.getByLabel('Department').selectOption('engineering');
      await page.getByLabel('E-mail verified').uncheck();
      await page.getByRole('button', { name: 'Log in' }).click();

      const claims = await readClaims(page);
      expect(claims).toMatchObject({
        sub: 'alice',
        name: 'Alice Edited',
        roles: ['admin'],
        department: 'engineering',
        email_verified: false,
      });
    });

    test('signs out and ends the provider session', async ({ page }) => {
      await page.getByRole('button', { name: 'Log in' }).click();
      await expect(page.getByTestId('subject')).toHaveText('alice');

      await page.getByRole('button', { name: 'Sign out' }).click();
      await expectAnonymous(page);
      expect(
        await page.evaluate(() => window.sessionStorage.getItem('mock.oidc.subject')),
      ).toBeNull();

      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveTitle('Mock OIDC login');
    });
  });
}
