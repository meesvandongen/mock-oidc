import { getResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { mockOidcPageDataElementId } from './authorize-page/page-data.js';
import { defineMockOidcConfig } from './config.js';
import { createMockOidcPageHandlers } from './page-handlers.js';

const config = defineMockOidcConfig({
  authorizationEndpointPath: 'oidc/authorize',
  endSessionEndpointPath: '/oidc/logout/',
  defaultSubject: 'test-user',
  claims: z.object({ name: z.string().meta({ title: 'Name' }) }),
  users: [{ subject: 'test-user', label: 'Test user', claims: { name: 'Test' } }],
});

const handlers = createMockOidcPageHandlers({
  issuerUrl: 'http://localhost:4301/app/',
  config,
});

async function get(url: string, init?: RequestInit) {
  return getResponse(handlers, new Request(url, init));
}

function readPageData(html: string) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  return JSON.parse(
    document.getElementById(mockOidcPageDataElementId)?.textContent ?? 'null',
  ) as { page: string; defaultSubject: string } | null;
}

describe('createMockOidcPageHandlers', () => {
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
    expect(await get('http://localhost:4301/app/oidc/token')).toBeUndefined();
    expect(
      await get('http://localhost:4301/app/oidc/authorize', { method: 'POST' }),
    ).toBeUndefined();
  });
});
