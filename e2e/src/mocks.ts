import { createOidcHandlers } from '@mvd/mock-oidc';
import { getMockOidcUserInfo } from '@mvd/mock-oidc/identity';
import { getMockOidcIdentityFromWindow } from '@mvd/mock-oidc/session';
import { issuerUrl, pageUrl } from './app-urls';
import { clientId, mockOidcConfig } from './mock-oidc.config';

/**
 * Starts the MSW service worker that serves the mock provider's discovery,
 * JWKS, token and userinfo endpoints during development. The interactive
 * authorize and logout pages are served by the Vite plugin.
 *
 * Playwright tests that use the adapter run without the worker and mock the
 * provider from the test process instead.
 */
export async function enableMocking() {
  if (import.meta.env.VITE_MOCK_OIDC_WORKER !== 'true') {
    return;
  }

  const { setupWorker } = await import('msw/browser');
  const worker = setupWorker(
    ...createOidcHandlers({
      issuerUrl,
      clientId,
      authorizationEndpointPath: mockOidcConfig.authorizationEndpointPath,
      endSessionEndpointPath: mockOidcConfig.endSessionEndpointPath,
      getUserInfo: () =>
        getMockOidcUserInfo(getMockOidcIdentityFromWindow(window, mockOidcConfig)),
    }),
  );

  await worker.start({
    serviceWorker: { url: pageUrl('mockServiceWorker.js') },
    onUnhandledRequest: 'bypass',
    quiet: true,
  });
}
