import { realpathSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { build, normalizePath } from 'vite';

const appRoot = fileURLToPath(new URL('../..', import.meta.url));
const authorizePagePluginName = '@mvd/mock-oidc:authorize-page';
const packageDirectory = normalizePath(
  realpathSync(dirname(fileURLToPath(import.meta.resolve('@mvd/mock-oidc')))),
);

/**
 * Modules that only exist to mock the provider: the package itself, its
 * dependencies, MSW, and the app's mock configuration. The claims schema is
 * the app's only use of zod.
 */
const mockModules: Record<string, (id: string) => boolean> = {
  '@mvd/mock-oidc': (id) => id.startsWith(`${packageDirectory}/`),
  jose: (id) => id.includes('/node_modules/jose/'),
  msw: (id) => id.includes('/node_modules/msw/') || id.includes('/node_modules/@mswjs/'),
  zod: (id) => id.includes('/node_modules/zod/'),
  'app mock modules': (id) =>
    id.endsWith('/src/mock-oidc.config.ts') || id.endsWith('/src/mock-oidc-worker.ts'),
};

/** Builds the app without writing it and lists the plugins and bundled modules. */
async function buildApp(mode: string) {
  let pluginNames: string[] = [];
  const result = await build({
    root: appRoot,
    mode,
    logLevel: 'silent',
    build: { write: false },
    plugins: [
      {
        name: 'list-plugins',
        configResolved(config) {
          pluginNames = config.plugins.map((plugin) => plugin.name);
        },
      },
    ],
  });
  if (!Array.isArray(result) && !('output' in result)) {
    throw new Error('Expected a build output instead of a watcher');
  }

  const moduleIds = (Array.isArray(result) ? result : [result])
    .flatMap(({ output }) => output)
    .flatMap((file) =>
      file.type === 'chunk'
        ? Object.entries(file.modules)
            .filter(([, module]) => module.renderedLength > 0)
            .map(([id]) => normalizePath(id))
        : [],
    );

  return {
    pluginNames,
    /** The bundled modules of every kind of mock module. */
    mockModuleIds: Object.fromEntries(
      Object.entries(mockModules).map(([name, matches]) => [
        name,
        moduleIds.filter(matches),
      ]),
    ),
  };
}

test('the production build contains nothing of the mock provider', async () => {
  const { pluginNames, mockModuleIds } = await buildApp('production');

  expect
    .soft(pluginNames.includes(authorizePagePluginName), 'authorize page plugin registered')
    .toBe(false);
  for (const [name, ids] of Object.entries(mockModuleIds)) {
    expect.soft(ids, `${name} modules in the production build`).toEqual([]);
  }
});

// Shows that the production test detects the mock provider when it is built.
test('the static demo build contains the mock provider', async () => {
  const { pluginNames, mockModuleIds } = await buildApp('static');

  expect(pluginNames).toContain(authorizePagePluginName);
  for (const [name, ids] of Object.entries(mockModuleIds)) {
    expect.soft(ids, `${name} modules in the static build`).not.toEqual([]);
  }
});
