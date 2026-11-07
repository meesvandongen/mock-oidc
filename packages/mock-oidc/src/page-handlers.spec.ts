import { getResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { createMockOidcFormSchema } from './authorize-page/form-schema.js';
import { mockOidcPageDataElementId } from './authorize-page/page-data.js';
import { defineMockOidcConfig } from './config.js';
import { createOidcHandlers } from './oidc-handlers.js';

const issuerUrl = 'http://localhost:4301/app/';

function createConfig(label = 'Test user') {
  return defineMockOidcConfig({
    authorizationEndpointPath: 'oidc/authorize',
    endSessionEndpointPath: '/oidc/logout/',
    defaultSubject: 'test-user',
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
        subject: 'test-user',
        label,
        claims: { permissions: ['role:read'], teams: ['support'] },
      },
    ],
  });
}

async function get(url: string, init?: RequestInit, config = createConfig()) {
  const handlers = createOidcHandlers({
    issuerUrl,
    clientId: 'test-client',
    config,
    getIdentity: () => ({ subject: 'test-user', claims: config.users[0]!.claims }),
  });
  return getResponse(handlers, new Request(url, init));
}

function readPageData(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return JSON.parse(
    document.getElementById(mockOidcPageDataElementId)?.textContent ?? 'null',
  ) as Record<string, unknown> | null;
}

describe('the authorize and end session pages', () => {
  it('serves the authorize page below the issuer URL', async () => {
    const response = await get(
      'http://localhost:4301/app/oidc/authorize?response_type=code&state=abc',
    );

    expect(response?.status).toBe(200);
    expect(response?.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response?.headers.get('Cache-Control')).toBe('no-store');
    const html = await response!.text();
    expect(html).toContain('<title>Mock OIDC login</title>');
    expect(readPageData(html)).toMatchObject({
      page: 'authorize',
      defaultSubject: 'test-user',
      users: [{ subject: 'test-user', label: 'Test user' }],
      storageKeys: { subject: 'mock.oidc.subject', claims: 'mock.oidc.claims' },
    });
  });

  it('serves the end session page', async () => {
    const response = await get('http://localhost:4301/app/oidc/logout/');

    const html = await response!.text();
    expect(html).toContain('<title>Mock OIDC logout</title>');
    expect(readPageData(html)).toMatchObject({ page: 'end-session' });
  });

  it('leaves other requests alone', async () => {
    expect(await get('http://localhost:4301/oidc/authorize')).toBeUndefined();
    expect(
      await get('http://localhost:4301/app/oidc/authorize', { method: 'POST' }),
    ).toBeUndefined();
  });

  it('escapes the embedded page data', async () => {
    const response = await get(
      'http://localhost:4301/app/oidc/authorize',
      undefined,
      createConfig('</script><script>alert(1)</script>'),
    );
    const html = await response!.text();

    expect(html).not.toContain('</script><script>alert(1)');
    expect(html).toContain('\\u003c/script>');
    expect(readPageData(html)).toMatchObject({
      users: [{ label: '</script><script>alert(1)</script>' }],
    });
  });

  it('describes the form as JSON Schema with the subject first', () => {
    expect(createMockOidcFormSchema(createConfig().claims)).toEqual({
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
});
