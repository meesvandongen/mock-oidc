import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { decodeMockOidcAuthorizationCode } from './authorization.js';
import { defineMockOidcConfig } from './config.js';
import { getMockOidcIdentity } from './identity.js';
import { createMockOidcPlaywrightAdapter } from './playwright.js';

const issuerUrl = 'http://localhost:4301';
const config = defineMockOidcConfig({
  defaultSubject: 'alice',
  allowedRedirectOrigins: ['http://localhost:5173'],
  claims: z.object({ name: z.string() }),
  users: [
    { subject: 'alice', label: 'Alice', claims: { name: 'Alice' } },
    { subject: 'bob', label: 'Bob', claims: { name: 'Bob' } },
  ],
});

function createAdapter(signedIn?: boolean) {
  return createMockOidcPlaywrightAdapter({
    config,
    issuerUrl,
    clientId: 'test-client',
    identity: getMockOidcIdentity(config),
    signedIn,
  });
}

function authorizeUrl(params: Record<string, string>) {
  return `${issuerUrl}/authorize?${new URLSearchParams(params)}`;
}

describe('createMockOidcPlaywrightAdapter', () => {
  it('redirects with a code that carries the nonce and PKCE challenge', () => {
    const location = new URL(
      createAdapter().authorize(
        authorizeUrl({
          response_type: 'code',
          redirect_uri: 'http://localhost:5173/callback?existing=1',
          state: 'state-1',
          nonce: 'nonce-1',
          code_challenge: 'challenge',
          code_challenge_method: 'S256',
        }),
      ),
    );

    expect(location.origin + location.pathname).toBe(
      'http://localhost:5173/callback',
    );
    expect(location.searchParams.get('existing')).toBe('1');
    expect(location.searchParams.get('state')).toBe('state-1');
    expect(
      decodeMockOidcAuthorizationCode(location.searchParams.get('code') ?? ''),
    ).toEqual({
      nonce: 'nonce-1',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
    });
  });

  it('supports the fragment response mode', () => {
    const location = new URL(
      createAdapter().authorize(
        authorizeUrl({
          redirect_uri: `${issuerUrl}/callback`,
          state: 'state-1',
          response_mode: 'fragment',
        }),
      ),
    );
    const fragment = new URLSearchParams(location.hash.slice(1));

    expect(location.search).toBe('');
    expect(fragment.get('state')).toBe('state-1');
    expect(fragment.get('code')).toMatch(/^mock-oidc\./);
  });

  it('answers prompt=none according to the provider session', () => {
    const adapter = createAdapter();
    const silentRequest = authorizeUrl({
      redirect_uri: `${issuerUrl}/callback`,
      state: 'silent',
      prompt: 'none',
    });

    expect(
      new URL(adapter.authorize(silentRequest)).searchParams.get('error'),
    ).toBe('login_required');

    adapter.authorize(
      authorizeUrl({ redirect_uri: `${issuerUrl}/callback`, state: 'login' }),
    );
    expect(adapter.signedIn).toBe(true);
    expect(
      new URL(adapter.authorize(silentRequest)).searchParams.get('code'),
    ).not.toBeNull();

    expect(
      adapter.endSession(
        `${issuerUrl}/logout?post_logout_redirect_uri=${encodeURIComponent('http://localhost:5173/')}&state=bye`,
      ),
    ).toBe('http://localhost:5173/?state=bye');
    expect(adapter.signedIn).toBe(false);
    expect(adapter.endSession(`${issuerUrl}/logout`)).toBeUndefined();
  });

  it('rejects redirects to origins that are not allowed', () => {
    expect(() =>
      createAdapter().authorize(
        authorizeUrl({ redirect_uri: 'https://evil.example/callback', state: 'x' }),
      ),
    ).toThrow('The mock OIDC redirect origin is not allowed');
    expect(() =>
      createAdapter().endSession(
        `${issuerUrl}/logout?post_logout_redirect_uri=${encodeURIComponent('https://evil.example/')}`,
      ),
    ).toThrow('The mock OIDC redirect origin is not allowed');
  });

  it('rejects requests for other endpoints', () => {
    expect(() =>
      createAdapter().authorize(`${issuerUrl}/other?redirect_uri=x`),
    ).toThrow('Unexpected mock OIDC endpoint');
  });

  it('routes the authorization and end session endpoints', async () => {
    const adapter = createAdapter(true);
    const routes: {
      matches: (url: URL) => boolean;
      handler: Parameters<Parameters<typeof adapter.route>[0]['route']>[1];
    }[] = [];
    await adapter.route({
      route: async (matches, handler) => {
        routes.push({ matches, handler });
      },
    });

    async function fulfill(url: string) {
      const route = routes.find((candidate) => candidate.matches(new URL(url)));
      let response: unknown;
      await route?.handler({
        request: () => ({ url: () => url }),
        fulfill: async (value) => {
          response = value;
        },
      });
      return response;
    }

    await expect(
      fulfill(authorizeUrl({ redirect_uri: `${issuerUrl}/cb`, state: 's' })),
    ).resolves.toMatchObject({
      status: 302,
      headers: { location: expect.stringContaining(`${issuerUrl}/cb?code=`) },
    });
    await expect(fulfill(`${issuerUrl}/logout`)).resolves.toMatchObject({
      status: 200,
    });
    expect(routes.some((route) => route.matches(new URL(`${issuerUrl}/jwks`)))).toBe(
      false,
    );
  });

  it('serves token claims for the current identity', async () => {
    const adapter = createAdapter();
    adapter.setIdentity(getMockOidcIdentity(config, 'bob'));

    expect(adapter.identity).toEqual({ subject: 'bob', claims: { name: 'Bob' } });
    expect(adapter.handlers).toHaveLength(4);
  });
});
