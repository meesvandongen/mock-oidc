---
'@mvd/mock-oidc': minor
---

Configure the claims of the ID token, the access token and the userinfo response separately.

`defineMockOidcConfig` accepts `idTokenClaims`, `accessTokenClaims` and `userInfoClaims`: a list of claim names, or a function that builds the claims from the identity, the granted scopes and the client ID. Each defaults to all claims. `accessTokenAudience` sets the `aud` of access tokens.

Authorization codes now carry the requested `scope`; access tokens get `scope` and `client_id` claims, and refreshed tokens keep the granted scope. The userinfo endpoint requires a valid access token and answers `401` without one.

Breaking changes:

- `createOidcHandlers` takes `config` and `getIdentity` instead of `getUserInfo`, `getTokenClaims`, `authorizationEndpointPath` and `endSessionEndpointPath`.
- The Playwright adapter's `getUserInfo` option, `getMockOidcUserInfo` and the `OidcClaims` type are removed; use the claim mappings of the config instead.
