import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from 'jose';
import { getResponse } from 'msw';
import { describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import { encodeMockOidcAuthorizationCode } from './authorization.js';
import { defineMockOidcConfig, type MockOidcConfigInput } from './config.js';
import { createOidcHandlers } from './oidc-handlers.js';

const issuerUrl = 'http://localhost:4301';
const claims = z.object({
  given_name: z.string(),
  email: z.email().optional(),
  roles: z.array(z.string()).default([]),
});

function createHandlers(
  mappings: Partial<MockOidcConfigInput<typeof claims>> = {},
  identityClaims: z.input<typeof claims> = { given_name: 'Test' },
) {
  const config = defineMockOidcConfig({
    defaultSubject: 'test-user',
    claims,
    users: [{ subject: 'test-user', label: 'Test user', claims: identityClaims }],
    ...mappings,
  });

  return createOidcHandlers({
    issuerUrl,
    clientId: 'test-client',
    tokenLifetimeSeconds: 30,
    config,
    getIdentity: () => ({
      subject: 'test-user',
      claims: config.users[0]!.claims,
    }),
  });
}

const handlers = createHandlers();

async function request(url: string, init?: RequestInit, using = handlers) {
  const response = await getResponse(using, new Request(url, init));
  if (!response) {
    throw new Error(`No mock OIDC handler for ${url}`);
  }

  return response;
}

async function requestToken(
  parameters: Record<string, string>,
  using = handlers,
) {
  const response = await request(
    `${issuerUrl}/access_token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(parameters),
    },
    using,
  );

  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

async function requestUserInfo(accessToken?: string, using = handlers) {
  return request(
    `${issuerUrl}/userinfo`,
    accessToken === undefined
      ? undefined
      : { headers: { Authorization: `Bearer ${accessToken}` } },
    using,
  );
}

const jwks = createLocalJWKSet(
  (await (await request(`${issuerUrl}/jwks`)).json()) as JSONWebKeySet,
);

async function signIn(
  using: typeof handlers,
  code: Parameters<typeof encodeMockOidcAuthorizationCode>[0] = {},
) {
  const { body } = await requestToken(
    {
      grant_type: 'authorization_code',
      code: encodeMockOidcAuthorizationCode(code),
    },
    using,
  );
  const tokens = body as {
    access_token: string;
    id_token: string;
    refresh_token: string;
  };

  return {
    tokens,
    idToken: (await jwtVerify(tokens.id_token, jwks)).payload,
    accessToken: (await jwtVerify(tokens.access_token, jwks)).payload,
    userInfo: await (await requestUserInfo(tokens.access_token, using)).json(),
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

  it('keeps the granted scope when refreshing tokens', async () => {
    const { tokens } = await signIn(handlers, { scope: 'openid email' });
    const { body } = await requestToken({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    });

    expect(body.scope).toBe('openid email');
    const { payload } = await jwtVerify(body.access_token as string, jwks);
    expect(payload.scope).toBe('openid email');
  });

  it('keeps nested claims intact in the ID token and userinfo', async () => {
    const nestedClaims = z.object({
      organization: z.object({
        name: z.string(),
        address: z.object({ city: z.string(), country: z.string() }),
      }),
      memberships: z.array(
        z.object({
          team: z.string(),
          roles: z.array(z.string()),
          projects: z.array(z.object({ key: z.string(), archived: z.boolean() })),
        }),
      ),
      group_paths: z.array(z.array(z.string())),
    });
    const identityClaims = {
      organization: { name: 'Acme', address: { city: 'Utrecht', country: 'NL' } },
      memberships: [
        { team: 'platform', roles: ['lead'], projects: [{ key: 'API', archived: false }] },
        { team: 'support', roles: ['member'], projects: [] },
      ],
      group_paths: [['acme', 'engineering']],
    };
    const config = defineMockOidcConfig({
      defaultSubject: 'carol',
      claims: nestedClaims,
      users: [{ subject: 'carol', label: 'Carol', claims: identityClaims }],
    });
    const { idToken, userInfo } = await signIn(
      createOidcHandlers({
        issuerUrl,
        clientId: 'test-client',
        config,
        getIdentity: () => ({ subject: 'carol', claims: identityClaims }),
      }),
    );

    expect(idToken).toMatchObject({ sub: 'carol', ...identityClaims });
    expect(userInfo).toEqual({ sub: 'carol', ...identityClaims });
  });

  it('includes all claims in every output by default', async () => {
    const { idToken, accessToken, userInfo } = await signIn(handlers, {
      scope: 'openid profile',
    });

    expect(idToken).toMatchObject({ sub: 'test-user', given_name: 'Test', roles: [] });
    expect(accessToken).toMatchObject({
      sub: 'test-user',
      aud: 'test-client',
      client_id: 'test-client',
      scope: 'openid profile',
      given_name: 'Test',
      roles: [],
    });
    expect(userInfo).toEqual({ sub: 'test-user', given_name: 'Test', roles: [] });
  });

  it('builds every output with its own claims mapping', async () => {
    const { idToken, accessToken, userInfo } = await signIn(
      createHandlers(
        {
          accessTokenAudience: 'https://api.example.com',
          idTokenClaims: ['given_name'],
          accessTokenClaims: ({ claims, clientId }) => ({
            permissions: claims.roles.map((role) => `${clientId}:${role}`),
          }),
          userInfoClaims: ({ claims, scopes }) => ({
            given_name: claims.given_name,
            ...(scopes.includes('email') ? { email: claims.email } : {}),
          }),
        },
        { given_name: 'Test', email: 'test@example.com', roles: ['admin'] },
      ),
      { nonce: 'nonce-1', scope: 'openid email' },
    );

    expect(idToken).toMatchObject({ sub: 'test-user', given_name: 'Test', nonce: 'nonce-1' });
    expect(idToken).not.toHaveProperty('email');
    expect(idToken).not.toHaveProperty('roles');

    expect(accessToken).toMatchObject({
      sub: 'test-user',
      aud: 'https://api.example.com',
      scope: 'openid email',
      permissions: ['test-client:admin'],
    });
    expect(accessToken).not.toHaveProperty('given_name');

    expect(userInfo).toEqual({
      sub: 'test-user',
      given_name: 'Test',
      email: 'test@example.com',
    });
  });

  it('gives the userinfo mapping the scope granted to the access token', async () => {
    const scopedHandlers = createHandlers(
      {
        userInfoClaims: ({ claims, scopes }) =>
          scopes.includes('email') ? { email: claims.email } : {},
      },
      { given_name: 'Test', email: 'test@example.com' },
    );

    await expect(
      signIn(scopedHandlers, { scope: 'openid email' }),
    ).resolves.toMatchObject({ userInfo: { email: 'test@example.com' } });
    await expect(
      signIn(scopedHandlers, { scope: 'openid' }),
    ).resolves.toMatchObject({ userInfo: { sub: 'test-user' } });
    expect((await signIn(scopedHandlers, { scope: 'openid' })).userInfo).not.toHaveProperty(
      'email',
    );
  });

  it('does not let mappings replace the subject, issuer or nonce', async () => {
    const reserved = () => ({ sub: 'mallory', iss: 'https://evil.example', nonce: 'x' });
    const { idToken, accessToken, userInfo } = await signIn(
      createHandlers({
        idTokenClaims: reserved,
        accessTokenClaims: reserved,
        userInfoClaims: reserved,
      }),
      { nonce: 'nonce-1' },
    );

    expect(idToken).toMatchObject({ sub: 'test-user', iss: issuerUrl, nonce: 'nonce-1' });
    expect(accessToken).toMatchObject({ sub: 'test-user', iss: issuerUrl });
    expect(userInfo).toMatchObject({ sub: 'test-user' });
  });

  it('requires a valid access token for userinfo', async () => {
    const missing = await requestUserInfo();
    expect(missing.status).toBe(401);
    expect(missing.headers.get('WWW-Authenticate')).toBe('Bearer');

    const invalid = await requestUserInfo('not-a-token');
    expect(invalid.status).toBe(401);
    expect(invalid.headers.get('WWW-Authenticate')).toMatch(/error="invalid_token"/);

    const { tokens } = await signIn(handlers);
    expect((await requestUserInfo(tokens.id_token)).status).toBe(401);
    expect((await requestUserInfo(tokens.access_token)).status).toBe(200);
  });
});
