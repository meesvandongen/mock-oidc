import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Allows running against a preinstalled Chromium whose revision differs from
// the one bundled with the installed Playwright version.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

/** Specs for code that runs in Node.js: the Vite plugin and Playwright adapter. */
const nodeSpecs = ['src/vite/**/*.spec.ts', 'src/playwright.spec.ts'];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: nodeSpecs,
        },
      },
      {
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
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({
              launchOptions: executablePath ? { executablePath } : {},
            }),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
