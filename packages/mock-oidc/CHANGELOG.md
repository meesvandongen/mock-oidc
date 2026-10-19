# @mvd/mock-oidc

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
