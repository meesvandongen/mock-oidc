import { oidcEarlyInit } from 'oidc-spa/entrypoint';

// Must run before anything else: it consumes the authorization response and
// answers silent sign-in requests when the page is loaded in an iframe.
const { shouldLoadApp } = oidcEarlyInit({ BASE_URL: '/oidc-spa/' });

if (shouldLoadApp) {
  void import('./main.lazy');
}
