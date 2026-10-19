import { fileURLToPath } from 'node:url';
import { mockOidcAuthorizePage } from '@mvd/mock-oidc/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { mockOidcConfig } from './src/mock-oidc.config';

const pages = [
  'react-oidc-context',
  'oidc-react',
  'oidc-spa',
  'axa-fr',
  'axa-fr/callback',
];

export default defineConfig(({ mode }) => ({
  // Both dev servers run side by side during the e2e tests.
  cacheDir: `node_modules/.vite/${mode}`,
  // oidc-spa's entrypoint and React utilities must share one instance of its
  // core; its Vite plugin normally configures this but does not support
  // multi-page apps.
  optimizeDeps: {
    exclude: ['oidc-spa', 'oidc-spa/entrypoint', 'oidc-spa/react-spa', 'oidc-spa/core'],
  },
  plugins: [
    react(),
    // Only the dev server and the static demo serve the mock provider. In
    // `playwright` mode it is mocked from the Playwright test process, and
    // production builds contain nothing of it.
    mockOidcAuthorizePage({
      enabled: mode === 'development' || mode === 'static',
      outputDirectory: 'dist',
      config: mockOidcConfig,
    }),
  ],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: Object.fromEntries([
        ['index', fileURLToPath(new URL('index.html', import.meta.url))],
        ...pages.map((page) => [
          page,
          fileURLToPath(new URL(`${page}/index.html`, import.meta.url)),
        ]),
      ]),
    },
  },
}));
