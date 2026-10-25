# mock-oidc

A mock OpenID Connect provider for single-page apps, published as
[`@mvd/mock-oidc`](packages/mock-oidc). See the
[package README](packages/mock-oidc/README.md) for how to use it, and the
[live demo](https://meesvandongen.github.io/mock-oidc/).

## Development

This is a pnpm workspace on the [Vite+](https://viteplus.dev) toolchain:

- `packages/mock-oidc` is the published package, built with `vp pack`
  (tsdown) and tested with `vp test` (Vitest);
- `apps/e2e` is an example app that depends on the package through the
  workspace and imports its build output, the way an app installing it from
  npm would.

```sh
pnpm install
pnpm build         # builds packages/mock-oidc into dist/
pnpm lint          # vp lint: Oxlint with type-aware rules
pnpm lint:publish  # checks the packed package with publint
pnpm test          # unit tests: Node and Chromium (Vitest browser mode)
pnpm typecheck
pnpm test:e2e      # builds the package and runs the Playwright suite in apps/e2e
```

The browser tests need Playwright's Chromium (`pnpm --filter @mvd/mock-oidc
exec playwright install chromium`). To use a different Chromium build, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

`apps/e2e` is a Vite multi-page app with one page per client library —
[react-oidc-context](https://github.com/authts/react-oidc-context),
[oidc-react](https://github.com/bjerkio/oidc-react),
[oidc-spa](https://github.com/keycloakify/oidc-spa) and
[@axa-fr/react-oidc](https://github.com/AxaFrance/oidc-client). Every library
is tested in three Playwright projects:

- `vite-dev` runs the development flow: the MSW worker in the browser plus the
  AutoForm authorize page served by the Vite plugin;
- `vite-static` runs the same tests against a static build served by
  `vp preview` under `/mock-oidc/`, using the pages the plugin writes to the
  build output;
- `playwright-adapter` runs the app without the plugin and worker
  (`vp dev --mode playwright`) and mocks the provider from the test process.

The `production-build` project builds the app in production mode and checks
that it contains nothing of the mock provider.

The same static build is published to GitHub Pages by
`.github/workflows/pages.yml` on every push to `main`. Build it locally with
`pnpm --filter @mvd/mock-oidc-e2e build:pages`.

## Releasing

Releases are managed with [Changesets](https://changesets.dev). Add a
changeset to every pull request that changes the published package:

```sh
pnpm changeset
```

`.github/workflows/release.yml` turns pending changesets on `main` into a
"Version Packages" pull request. Merging that pull request publishes the new
version to npm through
[trusted publishing](https://docs.npmjs.com/trusted-publishers), so the
workflow needs no npm token.
