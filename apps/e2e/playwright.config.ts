import { defineConfig, devices } from '@playwright/test';

const devServerUrl = 'http://localhost:5173';
const playwrightServerUrl = 'http://localhost:5174';
// Served under the same sub-path as the GitHub Pages deployment.
const staticBase = '/mock-oidc/';
const staticServerUrl = `http://localhost:5175${staticBase}`;
// The same flows without the Vite plugin: the MSW worker serves the pages.
const mswPagesDevServerUrl = 'http://localhost:5176';
const mswPagesStaticServerUrl = `http://localhost:5177${staticBase}`;
const mswPagesTests = ['vite-plugin/sign-in.spec.ts', 'msw-pages/**/*.spec.ts'];

// Allows running against a preinstalled Chromium whose revision differs from
// the one bundled with the installed Playwright version.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    ...devices['Desktop Chrome'],
    trace: 'retain-on-failure',
    launchOptions: executablePath ? { executablePath } : {},
  },
  projects: [
    {
      // The development flow: MSW worker in the browser plus the
      // interactive authorize page served by the Vite plugin.
      name: 'vite-dev',
      testDir: 'tests/vite-plugin',
      use: { baseURL: devServerUrl },
    },
    {
      // The same flow against a static build: the pages the Vite plugin
      // writes to the build output, served by `vite preview` under the
      // GitHub Pages sub-path.
      name: 'vite-static',
      testDir: 'tests/vite-plugin',
      use: { baseURL: staticServerUrl },
    },
    {
      // The test flow: the Playwright adapter mocks the provider from the
      // test process; the app runs without the plugin and worker.
      name: 'playwright-adapter',
      testDir: 'tests/playwright-adapter',
      use: { baseURL: playwrightServerUrl },
    },
    {
      // MSW 3 intercepts page navigations, so the worker can serve the
      // authorize and end session pages instead of the Vite plugin. Runs the
      // sign-in flows of every library and the limits of that approach.
      name: 'msw-pages-dev',
      testDir: 'tests',
      testMatch: mswPagesTests,
      use: { baseURL: mswPagesDevServerUrl },
    },
    {
      // The same against a static build without any mock provider pages in
      // the build output.
      name: 'msw-pages-static',
      testDir: 'tests',
      testMatch: mswPagesTests,
      use: { baseURL: mswPagesStaticServerUrl },
    },
    {
      // Builds the app for production, without a browser, and checks that
      // the mock provider is left out.
      name: 'production-build',
      testDir: 'tests/production-build',
    },
  ],
  webServer: [
    {
      command: 'pnpm exec vp dev --port 5173 --strictPort',
      url: devServerUrl,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm exec vp dev --mode playwright --port 5174 --strictPort',
      url: playwrightServerUrl,
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        `pnpm exec vp build --mode static --base ${staticBase} && ` +
        `pnpm exec vp preview --mode static --base ${staticBase} --port 5175 --strictPort`,
      url: staticServerUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm exec vp dev --mode msw-pages --port 5176 --strictPort',
      url: mswPagesDevServerUrl,
      reuseExistingServer: !process.env.CI,
    },
    {
      // A separate output directory: the vite-static build runs in parallel.
      command:
        `pnpm exec vp build --mode msw-pages --base ${staticBase} --outDir dist-msw-pages && ` +
        `pnpm exec vp preview --mode msw-pages --base ${staticBase} --outDir dist-msw-pages --port 5177 --strictPort`,
      url: mswPagesStaticServerUrl,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
