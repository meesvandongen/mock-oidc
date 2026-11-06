import { createOidcHandlers } from '@mvd/mock-oidc';
import { createMockOidcPageHandlers } from '@mvd/mock-oidc/pages';
import { getMockOidcIdentityFromWindow } from '@mvd/mock-oidc/session';
import { setupWorker } from 'msw/browser';
import { issuerUrl, pageUrl } from './app-urls';
import { clientId, mockOidcConfig } from './mock-oidc.config';

/**
 * Starts the MSW service worker that serves the mock provider's discovery,
 * JWKS, token and userinfo endpoints. Only loaded through `enableMocking`.
 *
 * In `msw-pages` mode it also serves the authorize and end session pages,
 * which MSW 3 can do because it intercepts page navigations; the Vite plugin
 * is disabled in that mode.
 */
export async function startMockOidcWorker() {
  const worker = setupWorker(
    ...createOidcHandlers({
      issuerUrl,
      clientId,
      config: mockOidcConfig,
      getIdentity: () => getMockOidcIdentityFromWindow(window, mockOidcConfig),
    }),
    ...(import.meta.env.VITE_MOCK_OIDC_PAGES === 'msw'
      ? createMockOidcPageHandlers({ issuerUrl, config: mockOidcConfig })
      : []),
  );

  await worker.start({
    serviceWorker: { url: pageUrl('mockServiceWorker.js') },
    onUnhandledFrame: 'bypass',
    quiet: true,
  });
}
