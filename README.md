# @mvd/mock-oidc

A mock OpenID Connect provider for single-page apps:

- a **zod** based configuration of mock users and their claims,
- **MSW** handlers for discovery, JWKS, token and userinfo endpoints,
- a **Vite** plugin that serves an interactive authorize page, generated from
  the claims schema with [AutoForm](https://github.com/vantezzen/autoform),
- a **Playwright** adapter that signs in a chosen identity without any UI.

Authorization codes carry the request's `nonce` and PKCE challenge, so the
token endpoint returns ID tokens with the right `nonce` and rejects
mismatching `code_verifier`s. `prompt=none` returns `login_required` until the
user has signed in, and the end session endpoint ends the mock session.

## Configure users

The claims are described by a zod object schema. User presets are validated
against it, and so is everything selected on the authorize page.

```ts
import { defineMockOidcConfig } from '@mvd/mock-oidc/config';
import { z } from 'zod';

export const mockOidcConfig = defineMockOidcConfig({
  authorizationEndpointPath: 'authorize', // default
  endSessionEndpointPath: 'logout', // default
  defaultSubject: 'demo-user',
  claims: z.object({
    name: z.string().min(1).meta({ title: 'Name' }),
    email: z.email().meta({ title: 'E-mail' }),
    permissions: z
      .array(z.enum(['app:read', 'app:write']))
      .meta({ title: 'Permissions', description: 'Granted permissions' }),
    team: z.enum(['support', 'operations']).optional(),
    email_verified: z.boolean().default(true),
  }),
  users: [
    {
      subject: 'demo-user',
      label: 'Demo user',
      claims: {
        name: 'Demo User',
        email: 'demo@example.com',
        permissions: ['app:read'],
      },
    },
  ],
});
```

The subject is not part of the claims schema; the reserved claims `sub`,
`iss`, `aud`, `exp`, `iat`, `nbf`, `jti` and `nonce` are rejected.

## Development: Vite plugin and MSW

```ts
// vite.config.ts
import { mockOidcAuthorizePage } from '@mvd/mock-oidc/vite';

export default defineConfig(({ mode }) => ({
  plugins: [
    mockOidcAuthorizePage({
      enabled: mode === 'development',
      outputDirectory: 'dist',
      config: mockOidcConfig,
    }),
  ],
}));
```

The plugin serves the authorize and end session pages in development and
writes them into `outputDirectory` on build, for static preview deployments.
The pages are self-contained: the authorize form is a prebuilt React and
AutoForm bundle, so your app needs neither. The claims schema is embedded as
JSON Schema and turned back into a zod schema in the browser:

| Claims schema               | Form field               |
| --------------------------- | ------------------------ |
| `z.string()`, `z.email()`   | text input               |
| `z.number()`, `z.int()`     | number input             |
| `z.boolean()`               | checkbox                 |
| `z.enum([...])`             | select                   |
| `z.array(z.enum([...]))`    | checkbox group           |
| `z.array(...)`              | repeatable list          |
| `z.object(...)`             | nested fieldset          |

`.meta({ title, description })` provides labels and help texts. Refinements
and transforms cannot be represented as JSON Schema; they are not checked by
the form, but they are applied when the MSW handlers read the identity.

The endpoints are served from the root of the dev server, so use the app
origin as issuer. The provider's other endpoints run in the browser with MSW:

```ts
import { createOidcHandlers } from '@mvd/mock-oidc';
import { getMockOidcUserInfo } from '@mvd/mock-oidc/identity';
import { getMockOidcIdentityFromWindow } from '@mvd/mock-oidc/session';
import { setupWorker } from 'msw/browser';

const worker = setupWorker(
  ...createOidcHandlers({
    issuerUrl: window.location.origin,
    clientId: 'my-app',
    authorizationEndpointPath: mockOidcConfig.authorizationEndpointPath,
    endSessionEndpointPath: mockOidcConfig.endSessionEndpointPath,
    getUserInfo: () =>
      getMockOidcUserInfo(getMockOidcIdentityFromWindow(window, mockOidcConfig)),
  }),
);
await worker.start({ onUnhandledRequest: 'bypass' });
```

The selected subject and claims are kept in `sessionStorage`
(`mock.oidc.subject` and `mock.oidc.claims`).

## Playwright

The adapter keeps the identity in the test process and answers the
authorization and end session requests with redirects, so sign-in in E2E
tests needs neither the authorize page nor the service worker. Combine it
with [`@msw/playwright`](https://github.com/mswjs/playwright) for the other
endpoints:

```ts
import { defineNetworkFixture, type NetworkFixture } from '@msw/playwright';
import { test as base } from '@playwright/test';
import { getMockOidcIdentity, type MockOidcIdentity } from '@mvd/mock-oidc';
import {
  createMockOidcPlaywrightAdapter,
  type MockOidcPlaywrightAdapter,
} from '@mvd/mock-oidc/playwright';

type Claims = typeof mockOidcConfig.claims;

export const test = base.extend<{
  identity: MockOidcIdentity<Claims>;
  mockOidc: MockOidcPlaywrightAdapter<Claims>;
  network: NetworkFixture;
}>({
  identity: [getMockOidcIdentity(mockOidcConfig, 'demo-user'), { option: true }],
  mockOidc: async ({ baseURL, context, identity }, use) => {
    const mockOidc = createMockOidcPlaywrightAdapter({
      config: mockOidcConfig,
      issuerUrl: baseURL!,
      clientId: 'my-app',
      identity,
    });
    await mockOidc.route(context);
    await use(mockOidc);
  },
  network: [
    async ({ context, mockOidc }, use) => {
      const network = defineNetworkFixture({ context, handlers: mockOidc.handlers });
      await network.enable();
      await use(network);
      await network.disable();
    },
    { auto: true },
  ],
});
```

```ts
test.use({
  identity: getMockOidcIdentity(mockOidcConfig, 'demo-user', {
    claims: { permissions: ['app:write'] },
  }),
});

test('shows the editor', async ({ page, mockOidc }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // mockOidc.setIdentity(...) switches the identity for later sign-ins.
});
```

`getMockOidcIdentity` merges overrides over the user's defaults and validates
the result with the claims schema. Pass `signedIn: true` to let `prompt=none`
requests succeed before an interactive sign-in.

## Development

```sh
pnpm install
pnpm test        # unit tests: Node and Chromium (Vitest browser mode)
pnpm typecheck
pnpm test:e2e    # builds the package and runs the Playwright suite in e2e/
```

The browser tests need Playwright's Chromium (`pnpm exec playwright install
chromium`). To use a different Chromium build, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

`e2e/` is a Vite multi-page app with one page per client library —
[react-oidc-context](https://github.com/authts/react-oidc-context),
[oidc-react](https://github.com/bjerkio/oidc-react),
[oidc-spa](https://github.com/keycloakify/oidc-spa) and
[@axa-fr/react-oidc](https://github.com/AxaFrance/oidc-client). Every library
is tested in two Playwright projects:

- `vite-dev` runs the development flow: the MSW worker in the browser plus the
  AutoForm authorize page from the Vite plugin;
- `playwright-adapter` runs the app without the plugin and worker
  (`vite --mode playwright`) and mocks the provider from the test process.
