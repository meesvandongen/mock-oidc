# @mvd/mock-oidc

Generic OIDC mock configuration, MSW handlers, a Vite authorize-page plugin,
and a small Playwright adapter. Applications provide their own users and
userinfo/profile builder.

## Configure users

```ts
import { defineMockOidcConfig } from '@mvd/mock-oidc/config';

export const mockOidcConfig = defineMockOidcConfig({
  authorizationEndpointPath: 'authorize',
  defaultSubject: 'demo-user',
  claimSelectors: [
    {
      claim: 'permissions',
      label: 'Permissions',
      options: ['app:read', 'app:write'],
    },
    {
      claim: 'teams',
      label: 'Teams',
      options: ['support'],
    },
  ],
  users: [
    {
      subject: 'demo-user',
      label: 'Demo user',
      claims: {
        permissions: ['app:read'],
        teams: ['support'],
      },
    },
  ],
});
```

Each claim selector configures a multi-select field by claim name, display
label, and allowed options. User-specific defaults are supplied as a map of
claim names to selected string values. Claims and defaults are validated
against the configured selectors and options.

## Vite

```ts
import { mockOidcAuthorizePage } from '@mvd/mock-oidc/vite';

mockOidcAuthorizePage({
  enabled: true,
  outputDirectory: 'dist/client',
  config: mockOidcConfig,
});
```

The plugin serves the selector in development and writes the same page into
the configured client build output for static preview deployments.

## MSW

```ts
import { createOidcHandlers } from '@mvd/mock-oidc';
import { getMockOidcIdentityFromWindow } from '@mvd/mock-oidc/session';

const handlers = createOidcHandlers({
  issuerUrl,
  clientId,
  authorizationEndpointPath: mockOidcConfig.authorizationEndpointPath,
  getUserInfo: () => {
    const identity = getMockOidcIdentityFromWindow(
      window,
      mockOidcConfig,
    );
    return buildUserInfo(identity);
  },
});
```

## Playwright

```ts
import { getMockOidcIdentity } from '@mvd/mock-oidc';
import { createMockOidcPlaywrightAdapter } from '@mvd/mock-oidc/playwright';

const identity = getMockOidcIdentity(mockOidcConfig, 'demo-user');
const mockOidc = createMockOidcPlaywrightAdapter({
  config: mockOidcConfig,
  issuerUrl,
  clientId,
  identity,
  getUserInfo: buildUserInfo,
});

network.use(...mockOidc.handlers);
await context.route(`**/${mockOidcConfig.authorizationEndpointPath}*`, (route) =>
  route.fulfill({
    status: 302,
    headers: { location: mockOidc.authorize(route.request().url()) },
  }),
);
```

The test adapter keeps the chosen identity in the test process and redirects
the authorization request directly, so ordinary E2E sign-in does not depend on
the interactive page or browser storage.
