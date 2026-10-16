import { defineConfig, devices } from '@playwright/test';

const devServerUrl = 'http://localhost:5173';
const playwrightServerUrl = 'http://localhost:5174';

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
      testDir: 'tests/vite-dev',
      use: { baseURL: devServerUrl },
    },
    {
      // The test flow: the Playwright adapter mocks the provider from the
      // test process; the app runs without the plugin and worker.
      name: 'playwright-adapter',
      testDir: 'tests/playwright-adapter',
      use: { baseURL: playwrightServerUrl },
    },
  ],
  webServer: [
    {
      command: 'pnpm exec vite --port 5173 --strictPort',
      url: devServerUrl,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'pnpm exec vite --mode playwright --port 5174 --strictPort',
      url: playwrightServerUrl,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
