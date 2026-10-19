/**
 * Authorization and end session logic shared by the Vite authorize page and
 * the Playwright adapter. Everything here runs in both browsers and Node.js.
 */

const authorizationCodePrefix = 'mock-oidc.';

export type MockOidcAuthorizationCode = {
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
};

export type MockOidcAuthorizationRequest = {
  redirectUri: URL;
  state: string | undefined;
  nonce: string | undefined;
  prompt: string[];
  responseMode: 'query' | 'fragment';
  codeChallenge: string | undefined;
  codeChallengeMethod: string | undefined;
};

export type MockOidcAuthorizationOutcome =
  | { code: string }
  | { error: string; errorDescription?: string };

export class MockOidcAuthorizationError extends Error {
  override name = 'MockOidcAuthorizationError';
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='));

  return new TextDecoder().decode(
    Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  );
}

/**
 * Encodes the request details the token endpoint needs into the authorization
 * code itself, so the mock token endpoint stays stateless.
 */
export function encodeMockOidcAuthorizationCode(
  code: MockOidcAuthorizationCode,
) {
  return `${authorizationCodePrefix}${encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(code)),
  )}`;
}

export function decodeMockOidcAuthorizationCode(
  code: string,
): MockOidcAuthorizationCode | undefined {
  if (!code.startsWith(authorizationCodePrefix)) {
    return undefined;
  }

  try {
    const decoded: unknown = JSON.parse(
      decodeBase64Url(code.slice(authorizationCodePrefix.length)),
    );
    if (typeof decoded !== 'object' || decoded === null) {
      return undefined;
    }

    const { nonce, codeChallenge, codeChallengeMethod } = decoded as Record<
      string,
      unknown
    >;

    return {
      ...(typeof nonce === 'string' ? { nonce } : {}),
      ...(typeof codeChallenge === 'string' ? { codeChallenge } : {}),
      ...(typeof codeChallengeMethod === 'string'
        ? { codeChallengeMethod }
        : {}),
    };
  } catch {
    return undefined;
  }
}

/** Verifies a PKCE code verifier against the challenge stored in a code. */
export async function verifyMockOidcCodeVerifier(
  code: MockOidcAuthorizationCode,
  codeVerifier: string | undefined,
) {
  if (code.codeChallenge === undefined) {
    return true;
  }

  if (codeVerifier === undefined) {
    return false;
  }

  if (code.codeChallengeMethod === 'plain') {
    return codeVerifier === code.codeChallenge;
  }

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(codeVerifier),
  );

  return encodeBase64Url(new Uint8Array(digest)) === code.codeChallenge;
}

function parseRedirectUri(
  value: string | null,
  allowedRedirectOrigins: readonly string[],
  parameter: string,
) {
  if (!value) {
    throw new MockOidcAuthorizationError(`Missing ${parameter} query parameter.`);
  }

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(value);
  } catch {
    throw new MockOidcAuthorizationError(`Invalid ${parameter} query parameter.`);
  }

  const allowedOrigins = allowedRedirectOrigins.map(
    (origin) => new URL(origin).origin,
  );
  if (!allowedOrigins.includes(redirectUrl.origin)) {
    throw new MockOidcAuthorizationError(
      `The mock OIDC redirect origin is not allowed: ${redirectUrl.origin}`,
    );
  }

  return redirectUrl;
}

/**
 * Parses and validates an authorization request URL. Only redirects to the
 * given origins are allowed.
 */
export function parseMockOidcAuthorizationRequest(
  requestUrl: string | URL,
  allowedRedirectOrigins: readonly string[],
): MockOidcAuthorizationRequest {
  const url = new URL(requestUrl);
  const params = url.searchParams;
  const responseType = params.get('response_type');
  if (responseType !== null && responseType !== 'code') {
    throw new MockOidcAuthorizationError(
      `Unsupported mock OIDC response_type: ${responseType}`,
    );
  }

  const responseMode = params.get('response_mode') ?? 'query';
  if (responseMode !== 'query' && responseMode !== 'fragment') {
    throw new MockOidcAuthorizationError(
      `Unsupported mock OIDC response_mode: ${responseMode}`,
    );
  }

  return {
    redirectUri: parseRedirectUri(
      params.get('redirect_uri'),
      allowedRedirectOrigins,
      'redirect_uri',
    ),
    state: params.get('state') ?? undefined,
    nonce: params.get('nonce') ?? undefined,
    prompt: (params.get('prompt') ?? '').split(' ').filter(Boolean),
    responseMode,
    codeChallenge: params.get('code_challenge') ?? undefined,
    codeChallengeMethod: params.get('code_challenge_method') ?? undefined,
  };
}

/** Creates an authorization code for a successful authorization request. */
export function createMockOidcAuthorizationCode(
  request: MockOidcAuthorizationRequest,
) {
  return encodeMockOidcAuthorizationCode({
    ...(request.nonce === undefined ? {} : { nonce: request.nonce }),
    ...(request.codeChallenge === undefined
      ? {}
      : {
          codeChallenge: request.codeChallenge,
          codeChallengeMethod: request.codeChallengeMethod ?? 'plain',
        }),
  });
}

/** Builds the redirect back to the client for an authorization outcome. */
export function createMockOidcAuthorizationResponseUrl(
  request: MockOidcAuthorizationRequest,
  outcome: MockOidcAuthorizationOutcome,
) {
  const redirectUrl = new URL(request.redirectUri);
  const params =
    request.responseMode === 'fragment'
      ? new URLSearchParams(redirectUrl.hash.slice(1))
      : redirectUrl.searchParams;

  if ('code' in outcome) {
    params.set('code', outcome.code);
  } else {
    params.set('error', outcome.error);
    if (outcome.errorDescription !== undefined) {
      params.set('error_description', outcome.errorDescription);
    }
  }

  if (request.state !== undefined) {
    params.set('state', request.state);
  }

  if (request.responseMode === 'fragment') {
    redirectUrl.hash = params.toString();
  }

  return redirectUrl.toString();
}

/**
 * Resolves the redirect for an RP-initiated logout request, or `undefined`
 * when the client did not ask to be redirected.
 */
export function createMockOidcEndSessionResponseUrl(
  requestUrl: string | URL,
  allowedRedirectOrigins: readonly string[],
) {
  const params = new URL(requestUrl).searchParams;
  const postLogoutRedirectUri = params.get('post_logout_redirect_uri');
  if (postLogoutRedirectUri === null) {
    return undefined;
  }

  const redirectUrl = parseRedirectUri(
    postLogoutRedirectUri,
    allowedRedirectOrigins,
    'post_logout_redirect_uri',
  );
  const state = params.get('state');
  if (state !== null) {
    redirectUrl.searchParams.set('state', state);
  }

  return redirectUrl.toString();
}
