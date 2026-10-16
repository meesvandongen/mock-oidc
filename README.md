# @mvd/mock-oidc

**Live demo:** https://meesvandongen.github.io/mock-oidc/ — the example app
from `e2e/` as a static site, with one page per OIDC client library.

A mock OpenID Connect provider for single-page apps:

- a **zod** based configuration of mock users and their claims,
- **MSW** handlers for discovery, JWKS, token and userinfo endpoints,
- a **Vite** plugin that serves an interactive authorize page, generated from
  the claims schema with [AutoForm](https://github.com/vantezzen/autoform),
- **Playwright** fixtures that sign in a chosen user without any UI.

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
Extensionless paths are written as HTML files (`authorize` becomes
`authorize.html`, `oidc/logout/` becomes `oidc/logout/index.html`), which
`vite preview` and static hosts such as Netlify, Vercel (`cleanUrls`),
Cloudflare Pages and GitHub Pages serve at the configured URL. Include the
MSW worker in such builds to serve the other endpoints.
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

The endpoint paths are relative to Vite's `base`, both on the dev server and
in the build output, so use the app's base URL as issuer (the origin when
`base` is `/`). The provider's other endpoints run in the browser with MSW:

```ts
import { createOidcHandlers } from '@mvd/mock-oidc';
import { getMockOidcUserInfo } from '@mvd/mock-oidc/identity';
import { getMockOidcIdentityFromWindow } from '@mvd/mock-oidc/session';
import { setupWorker } from 'msw/browser';

const worker = setupWorker(
  ...createOidcHandlers({
    issuerUrl: new URL(import.meta.env.BASE_URL, location.origin).href.replace(/\/$/, ''),
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

`withMockOidc` adds a mock provider to every browser context of a Playwright
`test`. It routes the provider's endpoints from the test process and answers
sign-in requests with redirects, so tests need neither the authorize page nor
the service worker.

```ts
// fixtures.ts
import { test as base } from '@playwright/test';
import { withMockOidc } from '@mvd/mock-oidc/playwright';

export const test = withMockOidc(base, {
  config: mockOidcConfig,
  clientId: 'my-app',
  // issuerUrl defaults to the project's baseURL
});
```

Choose the user with the `mockOidcUser` option: a configured subject, or a
subject with claim overrides. Overrides are merged over that user's defaults,
validated with the claims schema and type-checked against it.

```ts
test.use({ mockOidcUser: 'demo-user' });

test.use({
  mockOidcUser: { subject: 'demo-user', claims: { permissions: ['app:write'] } },
});
```

The `mockOidc` fixture controls the provider during a test:

```ts
test('switches users', async ({ page, mockOidc }) => {
  mockOidc.setUser('other-user'); // used by the next sign-in and token request
  mockOidc.signIn(); // start a provider session, so prompt=none succeeds
  mockOidc.signOut(); // end it again
  mockOidc.user; // the resolved { subject, claims }

  // Override provider endpoints with MSW handlers for this test.
  mockOidc.use(
    http.post('*/access_token', () =>
      HttpResponse.json({ error: 'invalid_grant' }, { status: 400 }),
    ),
  );
});
```

Without the fixtures, `createMockOidc({ config, issuerUrl, clientId, user })`
returns the same object; call `await mockOidc.install(pageOrContext)` to route
the endpoints.

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
is tested in three Playwright projects:

- `vite-dev` runs the development flow: the MSW worker in the browser plus the
  AutoForm authorize page served by the Vite plugin;
- `vite-static` runs the same tests against a static build served by
  `vite preview` under `/mock-oidc/`, using the pages the plugin writes to the
  build output;
- `playwright-adapter` runs the app without the plugin and worker
  (`vite --mode playwright`) and mocks the provider from the test process.

The same static build is published to GitHub Pages by
`.github/workflows/pages.yml` on every push to `main`. Build it locally with
`pnpm --filter @mvd/mock-oidc-e2e build:pages`.
