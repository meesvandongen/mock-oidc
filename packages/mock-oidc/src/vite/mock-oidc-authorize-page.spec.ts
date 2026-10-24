import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, createServer } from 'vite';
import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { defineMockOidcConfig } from '../config.js';
import {
  createMockOidcFormSchema,
  mockOidcAuthorizePage,
} from './mock-oidc-authorize-page.js';

function createTestConfig(
  authorizationEndpointPath = 'oidc/authorize/index.html',
) {
  return defineMockOidcConfig({
    authorizationEndpointPath,
    endSessionEndpointPath: 'oidc/logout/index.html',
    defaultSubject: 'custom-user',
    claims: z.object({
      permissions: z
        .array(z.enum(['role:read', 'role:write']))
        .meta({ title: 'Permissions' }),
      teams: z
        .array(z.enum(['support', 'operations']))
        .meta({ title: 'Teams', description: 'Teams of the user' }),
      email: z.email().optional(),
    }),
    users: [
      {
        subject: 'custom-user',
        label: 'Custom User',
        claims: {
          permissions: ['role:read'],
          teams: ['support'],
        },
      },
    ],
  });
}

function get(url: string) {
  return new Promise<{
    statusCode: number | undefined;
    headers: IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const request = httpRequest(url, (response: IncomingMessage) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body,
        });
      });
    });
    request.on('error', reject);
    request.end();
  });
}

describe('mockOidcAuthorizePage', () => {
  it('serves the mock page at the configured development endpoint', async () => {
    const server = await createServer({
      configFile: false,
      appType: 'custom',
      logLevel: 'silent',
      plugins: [
        mockOidcAuthorizePage({
          enabled: true,
          outputDirectory: 'dist/client',
          config: createTestConfig(),
        }),
      ],
      server: {
        host: '127.0.0.1',
        port: 0,
        strictPort: false,
      },
    });

    try {
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') {
        throw new Error('The Vite mock authorize test server did not start');
      }

      const response = await get(
        `http://127.0.0.1:${address.port}/oidc/authorize/index.html?state=test`,
      );

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toContain('text/html');
      expect(response.body).toContain('<title>Mock OIDC login</title>');
      expect(response.body).toContain('"subject":"custom-user"');
      expect(response.body).toContain('"label":"Custom User"');
      expect(response.body).toContain('"page":"authorize"');
      expect(response.body).toContain('mock.oidc.claims');
      expect(response.body).toContain('"title":"Permissions"');
      expect(response.body).toContain('role:write');
      expect(response.body).toContain('operations');

      const logout = await get(
        `http://127.0.0.1:${address.port}/oidc/logout/index.html`,
      );
      expect(logout.statusCode).toBe(200);
      expect(logout.body).toContain('<title>Mock OIDC logout</title>');
      expect(logout.body).toContain('"page":"end-session"');
    } finally {
      await server.close();
    }
  });

  it('serves the pages relative to the Vite base', async () => {
    const server = await createServer({
      configFile: false,
      appType: 'custom',
      logLevel: 'silent',
      base: '/app/',
      plugins: [
        mockOidcAuthorizePage({
          enabled: true,
          outputDirectory: 'dist',
          config: createTestConfig('authorize'),
        }),
      ],
      server: { host: '127.0.0.1', port: 0 },
    });

    try {
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') {
        throw new Error('The Vite mock authorize test server did not start');
      }
      const origin = `http://127.0.0.1:${address.port}`;

      const page = await get(`${origin}/app/authorize?state=test`);
      expect(page.statusCode).toBe(200);
      expect(page.body).toContain('<title>Mock OIDC login</title>');
      expect((await get(`${origin}/authorize`)).body).not.toContain(
        '<title>Mock OIDC login</title>',
      );
    } finally {
      await server.close();
    }
  });

  async function buildWithPlugin(
    config: ReturnType<typeof createTestConfig>,
    readPages: (outputDirectory: string) => Promise<void>,
  ) {
    const root = await mkdtemp(join(tmpdir(), 'auth-mock-authorize-'));

    try {
      await writeFile(
        join(root, 'index.html'),
        '<!doctype html><html><body><script type="module" src="/entry.js"></script></body></html>',
      );
      await writeFile(join(root, 'entry.js'), 'console.log("test");');

      await build({
        configFile: false,
        root,
        logLevel: 'silent',
        plugins: [
          mockOidcAuthorizePage({
            enabled: true,
            outputDirectory: 'build/client',
            config,
          }),
        ],
        build: {
          outDir: 'build/client',
          emptyOutDir: true,
        },
      });

      await readPages(join(root, 'build/client'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }

  it('copies the mock pages into the configured client build output', async () => {
    await buildWithPlugin(createTestConfig(), async (outputDirectory) => {
      await expect(
        readFile(join(outputDirectory, 'oidc/authorize/index.html'), 'utf8'),
      ).resolves.toContain('<title>Mock OIDC login</title>');
      await expect(
        readFile(join(outputDirectory, 'oidc/logout/index.html'), 'utf8'),
      ).resolves.toContain('<title>Mock OIDC logout</title>');
    });
  });

  it('writes extensionless endpoints as HTML files for static hosts', async () => {
    const config = defineMockOidcConfig({
      ...createTestConfig(),
      authorizationEndpointPath: 'authorize',
      endSessionEndpointPath: 'oidc/logout/',
    });

    await buildWithPlugin(config, async (outputDirectory) => {
      await expect(
        readFile(join(outputDirectory, 'authorize.html'), 'utf8'),
      ).resolves.toContain('<title>Mock OIDC login</title>');
      await expect(
        readFile(join(outputDirectory, 'oidc/logout/index.html'), 'utf8'),
      ).resolves.toContain('<title>Mock OIDC logout</title>');
    });
  });

  it('registers a reusable Vite plugin when mock authorization is enabled', () => {
    const plugin = mockOidcAuthorizePage({
      enabled: true,
      outputDirectory: 'dist/client',
      config: createTestConfig(),
    });

    expect(plugin?.name).toBe('@mvd/mock-oidc:authorize-page');
    expect(plugin?.configureServer).toBeDefined();
    expect(plugin?.writeBundle).toBeDefined();
  });

  it('does not register the page when mock authorization is disabled', () => {
    expect(
      mockOidcAuthorizePage({
        enabled: false,
        outputDirectory: 'dist/client',
        config: createTestConfig(),
      }),
    ).toBeUndefined();
  });

  it('describes the form as JSON Schema with the subject first', () => {
    expect(createMockOidcFormSchema(createTestConfig().claims)).toEqual({
      type: 'object',
      properties: {
        sub: { type: 'string', minLength: 1, title: 'Subject' },
        permissions: {
          title: 'Permissions',
          type: 'array',
          items: { type: 'string', enum: ['role:read', 'role:write'] },
        },
        teams: {
          title: 'Teams',
          description: 'Teams of the user',
          type: 'array',
          items: { type: 'string', enum: ['support', 'operations'] },
        },
        email: expect.objectContaining({ type: 'string', format: 'email' }),
      },
      required: ['sub', 'permissions', 'teams'],
    });
  });

  it('escapes the embedded page data', async () => {
    const config = defineMockOidcConfig({
      defaultSubject: 'user',
      claims: z.object({}),
      users: [{ subject: 'user', label: '</script><script>alert(1)</script>' }],
    });
    const server = await createServer({
      configFile: false,
      appType: 'custom',
      logLevel: 'silent',
      plugins: [
        mockOidcAuthorizePage({ enabled: true, outputDirectory: 'dist', config }),
      ],
      server: { host: '127.0.0.1', port: 0 },
    });

    try {
      await server.listen();
      const address = server.httpServer?.address();
      if (!address || typeof address === 'string') {
        throw new Error('The Vite mock authorize test server did not start');
      }
      const response = await get(`http://127.0.0.1:${address.port}/authorize`);

      expect(response.body).not.toContain('</script><script>alert(1)');
      expect(response.body).toContain('\\u003c/script>');
    } finally {
      await server.close();
    }
  });
});
