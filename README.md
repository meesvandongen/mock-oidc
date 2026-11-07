# mock-oidc

A mock OpenID Connect provider for single-page apps, published as
[`@mvd/mock-oidc`](packages/mock-oidc). See the
[package README](packages/mock-oidc/README.md) for how to use it, and the
[live demo](https://demo.mock-oidc.mvd.im/).

## Development

This is a pnpm workspace on the [Vite+](https://viteplus.dev) toolchain:

- `packages/mock-oidc` is the published package, built with `vp pack`
  (tsdown) and tested with `vp test` (Vitest);
- `apps/demo` is an example app that depends on the package through the
  workspace and imports its build output, the way an app installing it from
  npm would.

```sh
pnpm install
pnpm build         # builds packages/mock-oidc into dist/
pnpm lint          # vp lint: Oxlint with type-aware rules
pnpm lint:publish  # checks the packed package with publint
pnpm test          # unit tests: Node and Chromium (Vitest browser mode)
pnpm typecheck
pnpm test:e2e      # builds the package and runs the Playwright suite in apps/demo
```

The browser tests need Playwright's Chromium (`pnpm --filter @mvd/mock-oidc
exec playwright install chromium`). To use a different Chromium build, set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.

`apps/demo` is a Vite multi-page app with one page per client library —
[react-oidc-context](https://github.com/authts/react-oidc-context),
[oidc-react](https://github.com/bjerkio/oidc-react),
[oidc-spa](https://github.com/keycloakify/oidc-spa) and
[@axa-fr/react-oidc](https://github.com/AxaFrance/oidc-client). Every library
is tested in these Playwright projects:

- `msw-dev` runs the development flow: the MSW worker in the browser serves
  the whole provider, including the AutoForm authorize page;
- `msw-static` runs the same tests against a static build served by
  `vp preview` under `/mock-oidc/`;
- `playwright-adapter` runs the app without the worker
  (`vp dev --mode playwright`) and mocks the provider from the test process.

`tests/msw-worker/navigation.spec.ts` also pins down when the worker cannot
serve the authorize page (fresh tabs, reloads, pages without the worker).

The `production-build` project builds the app in production mode and checks
that it contains nothing of the mock provider.

The live demo is the same static build, deployed to Cloudflare Workers as
static assets only (no Worker script) with Workers Builds, configured by
`apps/demo/wrangler.jsonc`: `main` runs `wrangler deploy` to
[demo.mock-oidc.mvd.im](https://demo.mock-oidc.mvd.im/), and every other
branch gets its own Preview from `wrangler preview`, linked from its pull
request. Build it locally with `pnpm run build` in `apps/demo`.

## Documentation

`apps/docs` is a [Fumadocs](https://fumadocs.dev) site (Next.js, statically
exported) published at [mock-oidc.mvd.im](https://mock-oidc.mvd.im/). It is
deployed the same way as the demo, configured by `apps/docs/wrangler.jsonc`.
Run it with `pnpm dev:docs` and build it with `pnpm build:docs`. Point each
Workers Builds project at its app directory (`apps/demo` and `apps/docs`) so
that `wrangler deploy` picks up the matching config.

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
