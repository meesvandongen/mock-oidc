---
'@mvd/mock-oidc': minor
---

**Breaking:** the MSW worker now serves the authorize and end session pages, and the Vite plugin is removed.

MSW 3 intercepts page navigations, so `createOidcHandlers` now also returns handlers for the authorize and end session pages. The pages no longer need a dev server plugin or files in the build output.

To migrate:

- Remove `mockOidcAuthorizePage` from your Vite config. The `@mvd/mock-oidc/vite` entry point no longer exists, and the package no longer has a `vite` peer dependency.
- Upgrade to MSW 3 and regenerate `mockServiceWorker.js` (`npx msw init`). The `msw` peer dependency is now `>=3 <4`.
- Start the worker on every app page that sends users to the authorize page.

The worker serves the authorize page to navigations from a page that runs it. Opening the authorize URL in a fresh browser, or reloading the authorize page, reaches your server instead.
