import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from 'jose';
import { getResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { encodeMockOidcAuthorizationCode } from './authorization.js';
import { createOidcHandlers } from './oidc-handlers.js';

const issuerUrl = 'http://localhost:4301';
const handlers = createOidcHandlers({
  issuerUrl,
  clientId: 'test-client',
  tokenLifetimeSeconds: 30,
  getUserInfo: () => ({
    sub: 'test-user',
    given_name: 'Test',
  }),
});

async function request(url: string, init?: RequestInit) {
  const response = await getResponse(handlers, new Request(url, init));
  if (!response) {
    throw new Error(`No mock OIDC handler for ${url}`);
  }

  return response;
}

async function requestToken(parameters: Record<string, string>) {
  const response = await request(`${issuerUrl}/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(parameters),
  });

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

const codeVerifier = 'mock-oidc-test-code-verifier-0123456789-abcdefghij';
const codeChallenge = btoa(
  String.fromCharCode(
    ...new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier)),
    ),
  ),
)
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '');

describe('createOidcHandlers', () => {
  it('serves discovery metadata and a valid token response', async () => {
    const discoveryResponse = await request(
      `${issuerUrl}/.well-known/openid-configuration`,
    );
    const discovery = await discoveryResponse.json();

    expect(discovery).toMatchObject({
      issuer: issuerUrl,
      authorization_endpoint: `${issuerUrl}/authorize`,
      token_endpoint: `${issuerUrl}/access_token`,
      userinfo_endpoint: `${issuerUrl}/userinfo`,
      jwks_uri: `${issuerUrl}/jwks`,
      end_session_endpoint: `${issuerUrl}/logout`,
    });

    const tokenResponse = await request(`${issuerUrl}/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: encodeMockOidcAuthorizationCode({
          nonce: 'test-nonce',
          codeChallenge,
          codeChallengeMethod: 'S256',
        }),
        code_verifier: codeVerifier,
        scope: 'openid profile',
      }),
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
      nonce: string;
      iat: number;
      exp: number;
    };
    const now = Math.floor(Date.now() / 1000);
    const verifiedToken = await jwtVerify(
      tokens.id_token,
      createLocalJWKSet(
        (await (await request(`${issuerUrl}/jwks`)).json()) as JSONWebKeySet,
      ),
      {
        issuer: issuerUrl,
        audience: 'test-client',
      },
    );

    expect(tokens.expires_in).toBe(30);
    expect(tokens.scope).toBe('openid profile');
    expect(claims.sub).toBe('test-user');
    expect(claims.nonce).toBe('test-nonce');
    expect(claims.exp).toBeGreaterThan(now);
    expect(claims.exp - claims.iat).toBe(30);
    expect(verifiedToken.payload.sub).toBe('test-user');
  });

  it('rejects unknown codes and mismatching PKCE verifiers', async () => {
    await expect(
      requestToken({ grant_type: 'authorization_code', code: 'unknown' }),
    ).resolves.toMatchObject({ status: 400, body: { error: 'invalid_grant' } });

    await expect(
      requestToken({
        grant_type: 'authorization_code',
        code: encodeMockOidcAuthorizationCode({
          codeChallenge,
          codeChallengeMethod: 'S256',
        }),
        code_verifier: 'wrong-verifier',
      }),
    ).resolves.toMatchObject({ status: 400, body: { error: 'invalid_grant' } });

    await expect(
      requestToken({ grant_type: 'password' }),
    ).resolves.toMatchObject({
      status: 400,
      body: { error: 'unsupported_grant_type' },
    });
  });

  it('issues new tokens for refresh token grants', async () => {
    const { status, body } = await requestToken({
      grant_type: 'refresh_token',
      refresh_token: 'any',
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({ token_type: 'Bearer', expires_in: 30 });
  });
});
