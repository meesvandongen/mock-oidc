import { http, HttpResponse } from 'msw';
import { expectAnonymous, libraries, readClaims } from '../libraries';
import { expect, test } from './fixtures';

/**
 * The test flow: no authorize page or service worker. The user is chosen in
 * the test and the mock provider answers from the test process.
 */
for (const library of libraries) {
  test.describe(library.name, () => {
    test('signs in as the default user', async ({ page }) => {
      await page.goto(library.path);
      await expectAnonymous(page);
      await page.getByRole('button', { name: 'Sign in' }).click();

      await expect(page.getByTestId('subject')).toHaveText('alice');
      expect(await readClaims(page)).toMatchObject({
        sub: 'alice',
        name: 'Alice Example',
        roles: ['reader'],
        department: 'support',
      });
    });

    test.describe('with a user chosen by the test', () => {
      test.use({
        mockOidcUser: {
          subject: 'bob',
          claims: { roles: ['admin'], department: 'sales' },
        },
      });

      test('signs in with the overridden claims', async ({ page }) => {
        await page.goto(library.path);
        await page.getByRole('button', { name: 'Sign in' }).click();

        expect(await readClaims(page)).toMatchObject({
          sub: 'bob',
          name: 'Bob Example',
          roles: ['admin'],
          department: 'sales',
        });
      });
    });

    test('switches users between sign-ins', async ({ page, mockOidc }) => {
      await page.goto(library.path);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByTestId('subject')).toHaveText('alice');

      await page.getByRole('button', { name: 'Sign out' }).click();
      await expectAnonymous(page);
      expect(mockOidc.signedIn).toBe(false);

      mockOidc.setUser('bob');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page.getByTestId('subject')).toHaveText('bob');
    });

    test('lets tests override provider responses', async ({ page, mockOidc }) => {
      mockOidc.use(
        http.post('*/access_token', () =>
          HttpResponse.json(
            { error: 'invalid_grant', error_description: 'Denied by the test' },
            { status: 400 },
          ),
        ),
      );

      await page.goto(library.path);
      const tokenResponse = page.waitForResponse((response) =>
        response.url().endsWith('/access_token'),
      );
      await page.getByRole('button', { name: 'Sign in' }).click();

      expect((await tokenResponse).status()).toBe(400);
      await expect(page.getByTestId('subject')).toHaveCount(0);
      expect(mockOidc.signedIn).toBe(true);
    });
  });
}
