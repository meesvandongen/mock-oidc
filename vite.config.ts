import { defineConfig } from 'vite-plus';

export default defineConfig({
  // Mirrors the existing hand-written style; the repo is not formatter-managed.
  fmt: { singleQuote: true, printWidth: 80 },
  lint: {
    ignorePatterns: [
      '**/dist/**',
      'packages/mock-oidc/src/authorize-page/bundle.generated.ts',
    ],
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    rules: { 'vite-plus/prefer-vite-plus-imports': 'error' },
    options: { typeAware: true, typeCheck: true },
  },
});
