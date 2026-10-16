import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, createServer } from 'vite';
import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import { defineMockOidcConfig } from '../config.js';
import { mockOidcAuthorizePage } from './mock-oidc-authorize-page.js';

function expectValidationIssue(action: () => unknown, message: string) {
  let issues: readonly { message: string }[] = [];

  try {
    action();
  } catch (error) {
    if (!(error instanceof ZodError)) {
      throw error;
    }
    issues = error.issues;
  }

  expect(issues.map((issue) => issue.message)).toContain(message);
}

function createTestConfig(
  authorizationEndpointPath = 'oidc/authorize/index.html',
) {
  return defineMockOidcConfig({
    authorizationEndpointPath,
    defaultSubject: 'custom-user',
    claimSelectors: [
      {
        claim: 'permissions',
        label: 'Permissions',
        options: ['role:read', 'role:write'],
      },
      {
        claim: 'teams',
        label: 'Teams',
        options: ['support', 'operations'],
      },
    ],
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
      expect(response.body).toContain('custom-user');
      expect(response.body).toContain('Custom User');
      expect(response.body).toContain('mock.oidc.claims');
      expect(response.body).toContain('"claim":"permissions"');
      expect(response.body).toContain('"label":"Permissions"');
      expect(response.body).toContain('"claim":"teams"');
      expect(response.body).toContain('"label":"Teams"');
      expect(response.body).toContain('role:read');
      expect(response.body).toContain('role:write');
      expect(response.body).toContain('operations');
      expect(response.body).toContain("checkbox.type = 'checkbox'");
    } finally {
      await server.close();
    }
  });

  it('copies the mock page into the configured client build output', async () => {
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
            config: createTestConfig(),
          }),
        ],
        build: {
          outDir: 'build/client',
          emptyOutDir: true,
        },
      });

      const copiedPage = await readFile(
        join(root, 'build/client/oidc/authorize/index.html'),
        'utf8',
      );
      expect(copiedPage).toContain('<title>Mock OIDC login</title>');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
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

  it('rejects authorization paths that leave the configured route root', () => {
    expect(() =>
      defineMockOidcConfig({
        ...createTestConfig(),
        authorizationEndpointPath: '../authorize/index.html',
      }),
    ).toThrow('Invalid mock OIDC authorization endpoint path');
  });

  it('rejects default claim values that are not available to the user', () => {
    expectValidationIssue(
      () =>
        defineMockOidcConfig({
        authorizationEndpointPath: 'oidc/authorize/index.html',
        defaultSubject: 'custom-user',
        claimSelectors: [
          {
            claim: 'permissions',
            label: 'Permissions',
            options: ['role:read'],
          },
        ],
        users: [
          {
            subject: 'custom-user',
            label: 'Custom User',
            claims: {
              permissions: ['role:write'],
            },
          },
        ],
        }),
      'Default values for claim permissions must be configured options',
    );
  });
});
