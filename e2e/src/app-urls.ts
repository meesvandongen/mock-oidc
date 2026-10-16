/**
 * URLs relative to Vite's base, so the app works both at the site root
 * (dev server) and under a sub-path such as GitHub Pages' `/mock-oidc/`.
 */
export const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
  .href;

/** The mock provider is served from the app's base URL. */
export const issuerUrl = baseUrl.replace(/\/$/, '');

/** Absolute URL of a page of this app, e.g. `pageUrl('oidc-spa/')`. */
export function pageUrl(page: string) {
  return new URL(page, baseUrl).href;
}

/** Path of a page of this app, e.g. `/mock-oidc/oidc-spa/`. */
export function pagePath(page: string) {
  return new URL(page, baseUrl).pathname;
}
