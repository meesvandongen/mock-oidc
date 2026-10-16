import { createRemoteJWKSet, jwtVerify } from 'jose';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createOidcHandlers } from './oidc-handlers.js';

const issuerUrl = 'http://localhost:4301';
const server = setupServer(
  ...createOidcHandlers({
    issuerUrl,
    clientId: 'test-client',
    tokenLifetimeSeconds: 30,
    getUserInfo: () => ({
      sub: 'test-user',
      given_name: 'Test',
    }),
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('createOidcHandlers', () => {
  it('serves discovery metadata and a valid token response', async () => {
    const discoveryResponse = await fetch(
      `${issuerUrl}/.well-known/openid-configuration`,
    );
    const discovery = await discoveryResponse.json();

    expect(discovery).toMatchObject({
      issuer: issuerUrl,
      authorization_endpoint: `${issuerUrl}/authorize`,
      token_endpoint: `${issuerUrl}/access_token`,
      userinfo_endpoint: `${issuerUrl}/userinfo`,
      jwks_uri: `${issuerUrl}/jwks`,
    });

    const tokenResponse = await fetch(`${issuerUrl}/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ scope: 'openid profile' }),
    });
    const tokens = (await tokenResponse.json()) as {
      access_token: string;
      id_token: string;
      expires_in: number;
      scope: string;
    };

    const encodedClaims = tokens.id_token.split('.')[1];
    if (!encodedClaims) {
      throw new Error('The mock ID token has no payload');
    }
    const normalizedClaims = encodedClaims
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    const decodedClaims = atob(
      normalizedClaims.padEnd(Math.ceil(normalizedClaims.length / 4) * 4, '='),
    );
    const claims = JSON.parse(decodedClaims) as {
      sub: string;
      iat: number;
      exp: number;
    };
    const now = Math.floor(Date.now() / 1000);
    const verifiedToken = await jwtVerify(
      tokens.id_token,
      createRemoteJWKSet(new URL(`${issuerUrl}/jwks`)),
      {
        issuer: issuerUrl,
        audience: 'test-client',
      },
    );

    expect(tokens.expires_in).toBe(30);
    expect(tokens.scope).toBe('openid profile');
    expect(claims.sub).toBe('test-user');
    expect(claims.exp).toBeGreaterThan(now);
    expect(claims.exp - claims.iat).toBe(30);
    expect(verifiedToken.payload.sub).toBe('test-user');
  });
});
