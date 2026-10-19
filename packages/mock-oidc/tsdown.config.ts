import { defineConfig } from 'tsdown';

export default defineConfig({
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
});
