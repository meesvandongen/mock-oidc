import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { decodeMockOidcAuthorizationCode } from './authorization.js';
import { defineMockOidcConfig } from './config.js';
import { createMockOidc } from './playwright.js';

const issuerUrl = 'http://localhost:4301';
const config = defineMockOidcConfig({
  defaultSubject: 'alice',
  allowedRedirectOrigins: ['http://localhost:5173'],
  claims: z.object({
    name: z.string(),
    roles: z.array(z.enum(['reader', 'admin'])).default([]),
  }),
  users: [
    { subject: 'alice', label: 'Alice', claims: { name: 'Alice', roles: ['reader'] } },
    { subject: 'bob', label: 'Bob', claims: { name: 'Bob' } },
  ],
});

function createProvider(options: Partial<Parameters<typeof createMockOidc>[0]> = {}) {
  return createMockOidc({ config, issuerUrl, clientId: 'test-client', ...options });
}

function authorizeUrl(params: Record<string, string>) {
  return `${issuerUrl}/authorize?${new URLSearchParams(params)}`;
}

describe('createMockOidc', () => {
  it('resolves users by subject or with claim overrides', () => {
    const mockOidc = createProvider();
    expect(mockOidc.user).toEqual({
      subject: 'alice',
      claims: { name: 'Alice', roles: ['reader'] },
    });

    mockOidc.setUser('bob');
    expect(mockOidc.user).toEqual({ subject: 'bob', claims: { name: 'Bob', roles: [] } });

    mockOidc.setUser({ subject: 'bob', claims: { roles: ['admin'] } });
    expect(mockOidc.user.claims).toEqual({ name: 'Bob', roles: ['admin'] });

    mockOidc.setUser({ subject: 'carol', claims: { name: 'Carol' } });
    expect(mockOidc.user).toEqual({ subject: 'carol', claims: { name: 'Carol', roles: [] } });

    expect(() => mockOidc.setUser('dave')).toThrow(
      'Invalid mock OIDC claims for subject "dave"',
    );
    expect(createProvider({ user: { claims: { roles: ['admin'] } } }).user).toEqual({
      subject: 'alice',
      claims: { name: 'Alice', roles: ['admin'] },
    });
  });

  it('redirects with a code that carries the nonce and PKCE challenge', () => {
    const location = new URL(
      createProvider().authorize(
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

    expect(location.origin + location.pathname).toBe('http://localhost:5173/callback');
    expect(location.searchParams.get('existing')).toBe('1');
    expect(location.searchParams.get('state')).toBe('state-1');
    expect(decodeMockOidcAuthorizationCode(location.searchParams.get('code') ?? '')).toEqual({
      nonce: 'nonce-1',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
    });
  });

  it('supports the fragment response mode', () => {
    const location = new URL(
      createProvider().authorize(
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
    const mockOidc = createProvider();
    const silentRequest = authorizeUrl({
      redirect_uri: `${issuerUrl}/callback`,
      state: 'silent',
      prompt: 'none',
    });
    const silentResult = () => new URL(mockOidc.authorize(silentRequest)).searchParams;

    expect(silentResult().get('error')).toBe('login_required');

    mockOidc.signIn('bob');
    expect(mockOidc.signedIn).toBe(true);
    expect(mockOidc.user.subject).toBe('bob');
    expect(silentResult().get('code')).not.toBeNull();

    mockOidc.signOut();
    expect(silentResult().get('error')).toBe('login_required');

    mockOidc.authorize(authorizeUrl({ redirect_uri: `${issuerUrl}/callback`, state: 'login' }));
    expect(mockOidc.signedIn).toBe(true);

    expect(
      mockOidc.endSession(
        `${issuerUrl}/logout?post_logout_redirect_uri=${encodeURIComponent('http://localhost:5173/')}&state=bye`,
      ),
    ).toBe('http://localhost:5173/?state=bye');
    expect(mockOidc.signedIn).toBe(false);
    expect(mockOidc.endSession(`${issuerUrl}/logout`)).toBeUndefined();
  });

  it('serves the endpoints below an issuer path', () => {
    const mockOidc = createProvider({ issuerUrl: `${issuerUrl}/oidc/` });

    expect(
      new URL(
        mockOidc.authorize(
          `${issuerUrl}/oidc/authorize?redirect_uri=${encodeURIComponent(`${issuerUrl}/cb`)}`,
        ),
      ).searchParams.get('code'),
    ).not.toBeNull();
    expect(() =>
      mockOidc.authorize(`${issuerUrl}/authorize?redirect_uri=${issuerUrl}/cb`),
    ).toThrow('Unexpected mock OIDC endpoint');
  });

  it('rejects redirects to origins that are not allowed', () => {
    expect(() =>
      createProvider().authorize(
        authorizeUrl({ redirect_uri: 'https://evil.example/callback', state: 'x' }),
      ),
    ).toThrow('The mock OIDC redirect origin is not allowed');
    expect(() =>
      createProvider().endSession(
        `${issuerUrl}/logout?post_logout_redirect_uri=${encodeURIComponent('https://evil.example/')}`,
      ),
    ).toThrow('The mock OIDC redirect origin is not allowed');
  });
});
