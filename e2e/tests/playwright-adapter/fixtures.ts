import { defineNetworkFixture, type NetworkFixture } from '@msw/playwright';
import { test as base } from '@playwright/test';
import { getMockOidcIdentity, type MockOidcIdentity } from '@mvd/mock-oidc';
import {
  createMockOidcPlaywrightAdapter,
  type MockOidcPlaywrightAdapter,
} from '@mvd/mock-oidc/playwright';
import { clientId, mockOidcConfig } from '../../src/mock-oidc.config';

type Claims = typeof mockOidcConfig.claims;

/**
 * Mocks the provider from the test process: MSW handlers through
 * `@msw/playwright` for the HTTP endpoints, and Playwright routes that answer
 * the authorization and end session requests without any UI.
 */
export const test = base.extend<{
  identity: MockOidcIdentity<Claims>;
  mockOidc: MockOidcPlaywrightAdapter<Claims>;
  network: NetworkFixture;
}>({
  identity: [getMockOidcIdentity(mockOidcConfig, 'alice'), { option: true }],
  mockOidc: async ({ baseURL, context, identity }, use) => {
    if (!baseURL) {
      throw new Error('The playwright-adapter project requires a baseURL');
    }

    const mockOidc = createMockOidcPlaywrightAdapter({
      config: mockOidcConfig,
      issuerUrl: baseURL,
      clientId,
      identity,
    });
    await mockOidc.route(context);
    await use(mockOidc);
  },
  network: [
    async ({ context, mockOidc }, use) => {
      const network = defineNetworkFixture({
        context,
        handlers: mockOidc.handlers,
      });
      await network.enable();
      await use(network);
      await network.disable();
    },
    { auto: true },
  ],
});

export { expect } from '@playwright/test';
