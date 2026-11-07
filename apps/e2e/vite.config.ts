import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus';

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
  // The mock provider, including its authorize and end session pages, runs in
  // the browser with MSW (see src/mocks.ts); no Vite plugin is needed.
  plugins: [react()],
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
