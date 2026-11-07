import { defineConfig, devices } from '@playwright/test';

const devServerUrl = 'http://localhost:5173';
const playwrightServerUrl = 'http://localhost:5174';
// Served under a sub-path, to check that the app does not assume it runs at
// the site root.
const staticBase = '/mock-oidc/';
const staticServerUrl = `http://localhost:5175${staticBase}`;

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
      // The development flow: the MSW worker in the browser serves the
      // whole provider, including the authorize and end session pages.
      name: 'msw-dev',
      testDir: 'tests/msw-worker',
      use: { baseURL: devServerUrl },
    },
    {
      // The same flow against a static build served by `vite preview`
      // under a sub-path. The build output contains no
      // provider pages; the worker serves them.
      name: 'msw-static',
      testDir: 'tests/msw-worker',
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
  ],
});
