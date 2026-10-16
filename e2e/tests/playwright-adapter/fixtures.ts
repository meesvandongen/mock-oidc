import { test as base } from '@playwright/test';
import { withMockOidc } from '@mvd/mock-oidc/playwright';
import { clientId, mockOidcConfig } from '../../src/mock-oidc.config';

/**
 * Mocks the provider from the test process: every provider endpoint of the
 * browser context is routed, and sign-in redirects back without any UI.
 */
export const test = withMockOidc(base, { config: mockOidcConfig, clientId });

export { expect } from '@playwright/test';
