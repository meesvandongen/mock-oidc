import { createOidcHandlers } from '@mvd/mock-oidc';
import { getMockOidcUserInfo } from '@mvd/mock-oidc/identity';
import { getMockOidcIdentityFromWindow } from '@mvd/mock-oidc/session';
import { setupWorker } from 'msw/browser';
import { issuerUrl, pageUrl } from './app-urls';
import { clientId, mockOidcConfig } from './mock-oidc.config';

/**
 * Starts the MSW service worker that serves the mock provider's discovery,
 * JWKS, token and userinfo endpoints. Only loaded through `enableMocking`.
 */
export async function startMockOidcWorker() {
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
