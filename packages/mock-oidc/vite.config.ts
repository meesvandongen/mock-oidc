import { defineConfig } from 'vite-plus';
import { playwright } from 'vite-plus/test/browser-playwright';

// Allows running against a preinstalled Chromium whose revision differs from
// the one bundled with the installed Playwright version.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

/** Specs for code that runs in Node.js: the Vite plugin and Playwright adapter. */
const nodeSpecs = ['src/vite/**/*.spec.ts', 'src/playwright.spec.ts'];

export default defineConfig({
  pack: {
    // One entry per subpath in the package.json `exports` map.
    entry: {
      index: 'src/index.ts',
      config: 'src/config.ts',
      identity: 'src/identity.ts',
      'oidc-session': 'src/oidc-session.ts',
      playwright: 'src/playwright.ts',
      vite: 'src/vite.ts',
      authorization: 'src/authorization.ts',
    },
    format: 'esm',
    // Most entries run in the browser as well as in Node.js; `neutral` also
    // keeps the `.js`/`.d.ts` extensions that the exports map points to.
    platform: 'neutral',
    target: 'es2022',
    // Only the Vite plugin imports Node.js built-ins.
    deps: { neverBundle: [/^node:/] },
    dts: true,
  },
  test: {
    // Vitest 4 behaviour, kept through the move to Vitest 5 in Vite+:
    // separate Vite servers for the inline projects, which do not inherit
    // this root config, and mock call history kept between tests.
    // https://viteplus.dev/guide/vitest-v5#remove-unneeded-compatibility-settings
    sharedViteServer: false,
    clearMocks: false,
    projects: [
      {
        extends: false,
        test: {
          name: 'node',
          environment: 'node',
          include: nodeSpecs,
          clearMocks: false,
        },
      },
      {
        extends: false,
        // Pre-bundled up front so Vite does not reload a running test.
        optimizeDeps: {
          include: [
            '@autoform/react/react-hook-form',
            '@autoform/zod',
            'react',
            'react-dom/client',
            'react/jsx-dev-runtime',
            'react-hook-form',
          ],
        },
        test: {
          name: 'browser',
          include: ['src/**/*.spec.{ts,tsx}'],
          exclude: nodeSpecs,
          clearMocks: false,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: executablePath ? { executablePath } : {},
            }),
            instances: [{ browser: 'chromium' }],
            // Vitest 4 behaviour: partial, case-insensitive locator matching.
            locators: { exact: false },
          },
        },
      },
    ],
  },
});
