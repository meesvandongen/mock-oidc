# @mvd/mock-oidc

## 0.4.0

### Minor Changes

- [#26](https://github.com/meesvandongen/mock-oidc/pull/26) [`8c97c4f`](https://github.com/meesvandongen/mock-oidc/commit/8c97c4fc3e9277ce76c8c5d8cae30edd06975638) Thanks [@meesvandongen](https://github.com/meesvandongen)! - **Breaking:** the MSW worker now serves the authorize and end session pages, and the Vite plugin is removed.
  
  MSW 3 intercepts page navigations, so `createOidcHandlers` now also returns handlers for the authorize and end session pages. The pages no longer need a dev server plugin or files in the build output.
  
  To migrate:
  
  - Remove `mockOidcAuthorizePage` from your Vite config. The `@mvd/mock-oidc/vite` entry point no longer exists, and the package no longer has a `vite` peer dependency.
  - Upgrade to MSW 3 and regenerate `mockServiceWorker.js` (`npx msw init`). The `msw` peer dependency is now `>=3 <4`.
  - Start the worker on every app page that sends users to the authorize page.
  
  The worker serves the authorize page to navigations from a page that runs it. Opening the authorize URL in a fresh browser, or reloading the authorize page, reaches your server instead.

## 0.3.0

### Minor Changes

- [#23](https://github.com/meesvandongen/mock-oidc/pull/23) [`48547e1`](https://github.com/meesvandongen/mock-oidc/commit/48547e16033ee8383c3444f7b81c93c1feb49444) Thanks [@meesvandongen](https://github.com/meesvandongen)! - Support MSW 3: the `msw` peer dependency now accepts `>=2 <4`.

## 0.2.0

### Minor Changes

- [#10](https://github.com/meesvandongen/mock-oidc/pull/10) [`ecc3165`](https://github.com/meesvandongen/mock-oidc/commit/ecc3165c485c900c047a2b29670a40737f0dd89d) Thanks [@meesvandongen](https://github.com/meesvandongen)! - Configure the claims of the ID token, the access token and the userinfo response separately.
  
  `defineMockOidcConfig` accepts `idTokenClaims`, `accessTokenClaims` and `userInfoClaims`: a list of claim names, or a function that builds the claims from the identity, the granted scopes and the client ID. Each defaults to all claims. `accessTokenAudience` sets the `aud` of access tokens.
  
  Authorization codes now carry the requested `scope`; access tokens get `scope` and `client_id` claims, and refreshed tokens keep the granted scope. The userinfo endpoint requires a valid access token and answers `401` without one.
  
  Breaking changes:
  
  - `createOidcHandlers` takes `config` and `getIdentity` instead of `getUserInfo`, `getTokenClaims`, `authorizationEndpointPath` and `endSessionEndpointPath`.
  - The Playwright adapter's `getUserInfo` option, `getMockOidcUserInfo` and the `OidcClaims` type are removed; use the claim mappings of the config instead.

## 0.1.1

### Patch Changes

- [#8](https://github.com/meesvandongen/mock-oidc/pull/8) [`1961455`](https://github.com/meesvandongen/mock-oidc/commit/1961455ef7b4eeda17b38b21d4f2a370a351e4b5) Thanks [@meesvandongen](https://github.com/meesvandongen)! - Publish from GitHub Actions through npm trusted publishing, with provenance.
