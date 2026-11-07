import { expect, type Page, test as base } from '@playwright/test';
import { expectAnonymous, libraries } from '../libraries';

/**
 * MSW 3 intercepts page navigations (`mode: 'navigate'`), which is how the
 * worker serves the authorize and end session pages. These tests pin down
 * when that works: the service worker hands a navigation to a page that runs
 * MSW, so there must be one when the navigation starts.
 *
 * The server has no authorize page: the dev server and `vite preview` answer
 * with their SPA fallback, the example index.
 */
const loginTitle = 'Mock OIDC login';
const app = libraries[0];

const test = base.extend<{
  authorizeUrl: (params?: Record<string, string>) => string;
}>({
  authorizeUrl: async ({ baseURL }, use) => {
    await use((params = {}) =>
      new URL(
        `authorize?${new URLSearchParams({
          response_type: 'code',
          client_id: 'mock-oidc-e2e',
          redirect_uri: new URL('callback', baseURL).href,
          state: 'test-state',
          ...params,
        })}`,
        baseURL,
      ).href,
    );
  },
});

/** Opens an app page; it renders once the MSW worker is running. */
async function openApp(page: Page) {
  await page.goto(app.path);
  await expectAnonymous(page);
}

test('serves the authorize page to navigations from a page that runs the worker', async ({
  page,
  authorizeUrl,
}) => {
  await openApp(page);

  await page.goto(authorizeUrl());
  await expect(page).toHaveTitle(loginTitle);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(/\/callback\?code=mock-oidc\.[^&]+&state=test-state$/);
});

test('serves the authorize page to link clicks and location changes', async ({
  page,
  authorizeUrl,
}) => {
  await openApp(page);

  // A navigation started by the page itself, as client libraries do.
  await page.evaluate((url) => window.location.assign(url), authorizeUrl());
  await expect(page).toHaveTitle(loginTitle);
  await expect(page.getByLabel('User')).toBeVisible();
});

test('answers prompt=none in an iframe of a page that runs the worker', async ({
  page,
  authorizeUrl,
}) => {
  await openApp(page);

  // Silent sign-in loads the authorize endpoint in a hidden iframe.
  const callback = page.waitForEvent(
    'framenavigated',
    (frame) => frame !== page.mainFrame() && frame.url().includes('/callback'),
  );
  await page.evaluate((url) => {
    const iframe = document.createElement('iframe');
    iframe.src = url;
    document.body.append(iframe);
  }, authorizeUrl({ prompt: 'none' }));

  expect((await callback).url()).toMatch(
    /\/callback\?error=login_required&.*state=test-state$/,
  );
});

test('serves the end session page', async ({ page, baseURL }) => {
  await openApp(page);
  await page.evaluate(() => window.sessionStorage.setItem('mock.oidc.subject', 'bob'));

  await page.goto(
    new URL(
      `logout?${new URLSearchParams({
        post_logout_redirect_uri: new URL(app.path, baseURL).href,
      })}`,
      baseURL,
    ).href,
  );
  await expectAnonymous(page);
  expect(
    await page.evaluate(() => window.sessionStorage.getItem('mock.oidc.subject')),
  ).toBeNull();
});

test.describe('limitations', () => {
  test('a new tab opened at the authorize URL gets the server response', async ({
    page,
    authorizeUrl,
  }) => {
    // No service worker is registered yet in a fresh browser context.
    await page.goto(authorizeUrl());
    await expect(page).not.toHaveTitle(loginTitle);
  });

  test('navigations from a page without the worker get the server response', async ({
    page,
    authorizeUrl,
  }) => {
    // The worker is installed and controls the next page, but that page
    // (the example index) does not start MSW, so nothing answers the
    // navigation in the browser.
    await openApp(page);
    await page.goto('./');
    await expect(page).toHaveTitle('mock OIDC examples');

    await page.goto(authorizeUrl());
    await expect(page).not.toHaveTitle(loginTitle);
  });

  test('reloading the authorize page gets the server response', async ({
    page,
    authorizeUrl,
  }) => {
    await openApp(page);
    await page.goto(authorizeUrl());
    await expect(page).toHaveTitle(loginTitle);

    // The authorize page itself does not run MSW.
    await page.reload();
    await expect(page).not.toHaveTitle(loginTitle);
  });

  test('another tab that runs the worker answers navigations of new tabs', async ({
    context,
    page,
    authorizeUrl,
  }) => {
    // Without a page of its own that runs MSW, the worker falls back to any
    // visible one, so with an app tab open a new tab gets the authorize page.
    await openApp(page);

    const otherPage = await context.newPage();
    await otherPage.goto(authorizeUrl());
    await expect(otherPage).toHaveTitle(loginTitle);

    // A reload is attributed to the authorize page itself, which does not
    // run MSW, so it still gets the server response.
    await otherPage.reload();
    await expect(otherPage).not.toHaveTitle(loginTitle);
  });
});
