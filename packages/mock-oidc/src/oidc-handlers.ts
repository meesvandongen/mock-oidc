import { importJWK, jwtVerify, SignJWT } from 'jose';
import { type HttpHandler, HttpResponse, http } from 'msw';
import {
  decodeMockOidcAuthorizationCode,
  verifyMockOidcCodeVerifier,
} from './authorization.js';
import type {
  MockOidcClaimsContext,
  MockOidcClaimsSchema,
  MockOidcConfig,
} from './config.js';
import type { MockOidcIdentity } from './identity.js';

export type CreateOidcHandlersOptions<
  TClaims extends MockOidcClaimsSchema = MockOidcClaimsSchema,
> = {
  issuerUrl: string;
  /** Audience of issued tokens when the token request has no `client_id`. */
  clientId: string;
  /**
   * Provides the endpoint paths, the access token audience and the claim
   * mappings of the ID token, access token and userinfo response.
   */
  config: MockOidcConfig<TClaims>;
  /** The identity that the token and userinfo endpoints answer for. */
  getIdentity: () =>
    | MockOidcIdentity<TClaims>
    | Promise<MockOidcIdentity<TClaims>>;
  tokenLifetimeSeconds?: number;
  tokenEndpointPath?: string;
  userInfoEndpointPath?: string;
  jwksPath?: string;
};

const mockPrivateJwk = {
  kty: 'RSA',
  n: 'vwvG14Hc_E8SfPLRdhTrffJBFpB3wyCoGTimjd6d-16CZYpMEGxWOVXlhJ2VBvRpQoyh_PmxrcJ3_dHKr7N_Ou55UTwDLnmGStPOgEglIawlOmwXj6rzUXlJ-OuZsGs-KgOW4s9Jr4NNhjkswFPt_uh8l5RE7e-RrvDyQ0lzsDoVL4sODdBImKJR_rqC7UWg-hlVhHiA9nVIyDWYoi1tBTLtVX5_g6u1VDHtgGBfGaOB8PUHtyKH7lbrSpDMLMuIQw-kn7HF9ukrmQwFfKTkGoafa-etCF0HdHOcZUSgZG4Yq6ipS5_KFKSPnWJcPWYaM3S42cFof4e1SiYya9c5Fw',
  e: 'AQAB',
  d: 'qLIvfPDxP-JawvZvO0Oxxl76VoBvIGBfzxWVDMU831BO-HasP_xKDwroRrgXdjKwF9Gy4H1kBbko13o-7fMkL9eQTMkfThSFHuH1AJW0JA2sOfBkxboAbTsatLDl30Bzfgn5XIIJ4O-irxkhiRsTlvmXuwlz7F6VV9LvObdMbpj0ajMv4oKodErMr6OIzV7xz7fHW9qnlHLf9axiMhj6ACm0o6iSmRdBSUrX2_Z-PjtNd1YJdyvtF5szPzItTIf_RRLiNrTul7nhoVgk_mnLbXZdkGVxWMUXez8C1zE-20Li2QeeHw368ixM6guPrixwTnh3LH4kiEYnjgSSgn2V8Q',
  p: '5ghq02Nn32A8bTuUFeamSbs9XwAw4ouK2o3WUKwJrv5bgftlhssfFFOme10p44w6_h7iw8crYgpIFh5De3sD4Dyya8_pLXf07B0QEpJt_ZSN3Lar2pZWZ1q6Bk_EV6u3fUux_jvvDKkjw4BUiNU6feC9ZFmv6_A78Ug36Ii1O5s',
  q: '1JyzcyYebvnMCF8IIWBfKk58Twur9bpYiO1WEk8BuTn0TXfa2kvObzBR98q6bp0_RQTQQFKAdXCmpEoROKurYYGXHRy5eD6B5eGP9vSo5nAp689GqUlKWevZUlIbBC2o24lk2U3DbzwRDLT60F1U7Qr8mRuVFlyEgUDGAQYoxjU',
  dp: 'tGUXeW00cW3kFXmqmT5HW_0VlOHudEsgemLPFnbEJVLd6mJ_bSTv2536KjaWehdn0A_in8wazojnnUjgfP6svHZ9KaVj5L90-JGWICprTXjpg5RR01sgqW7yAa8ed-53ODBbhtfzkQc3v8JtCN3HQB42CHN5TdsY9xA-oAJNtk8',
  dq: 'aL2h8hJPX-CT0XPvr3GosFDmEJLxbicVQq-ZfX-Km9OfNSLcoDpEQqaNWwN2gNPavYe3iFicjD6o-bq7bS21Sl3rMh5aiJBSsgtDPygcpRmQrWj5qKBAjrgP4ews_wv3ad_v3NXgd8YhqB7oiQnRss18z3i1I8UESiC86vg70hk',
  qi: 'nhEdPUI5LlOgksUlfPPWo6T6AVricYeB6x88p6hF7LCqD9gbnyNU9yfpPUtpDw8BEgaMGzukKdVGmMQ8nqQ0HoSLRGCSxr_ikwxPeXrWl6hiVR-h4PKGtcdceLvDIonweF1jMl3hhkUz72yDh8tgh4Xsr5dS0H24Ti4flpl9JUQ',
  kid: 'system-mock-oidc-rs256',
  alg: 'RS256',
  use: 'sig',
} as const;

const mockJwks = {
  keys: [
    {
      kty: mockPrivateJwk.kty,
      n: mockPrivateJwk.n,
      e: mockPrivateJwk.e,
      kid: mockPrivateJwk.kid,
      alg: mockPrivateJwk.alg,
      use: mockPrivateJwk.use,
    },
  ],
} as const;

const privateKeyPromise = importJWK(mockPrivateJwk, mockPrivateJwk.alg);
const publicKeyPromise = importJWK(mockJwks.keys[0], mockPrivateJwk.alg);

function joinIssuerPath(issuerUrl: string, endpointPath: string) {
  return `${issuerUrl}/${endpointPath.replace(/^\/+/, '')}`;
}

function createWellKnownConfiguration(
  issuerUrl: string,
  options: Pick<
    CreateOidcHandlersOptions,
    'tokenEndpointPath' | 'userInfoEndpointPath' | 'jwksPath'
  > & {
    config: Pick<
      MockOidcConfig,
      'authorizationEndpointPath' | 'endSessionEndpointPath'
    >;
  },
) {
  const { authorizationEndpointPath, endSessionEndpointPath } = options.config;
  const tokenEndpointPath = options.tokenEndpointPath ?? 'access_token';
  const userInfoEndpointPath = options.userInfoEndpointPath ?? 'userinfo';
  const jwksPath = options.jwksPath ?? 'jwks';

  return {
    issuer: issuerUrl,
    authorization_endpoint: joinIssuerPath(
      issuerUrl,
      authorizationEndpointPath,
    ),
    token_endpoint: joinIssuerPath(issuerUrl, tokenEndpointPath),
    userinfo_endpoint: joinIssuerPath(issuerUrl, userInfoEndpointPath),
    jwks_uri: joinIssuerPath(issuerUrl, jwksPath),
    end_session_endpoint: joinIssuerPath(issuerUrl, endSessionEndpointPath),
    scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
    response_types_supported: ['code'],
    response_modes_supported: ['query', 'fragment'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: [mockPrivateJwk.alg],
    token_endpoint_auth_methods_supported: ['none'],
    code_challenge_methods_supported: ['S256'],
  };
}

async function signJwt(
  payload: Record<string, unknown>,
  {
    issuerUrl,
    audience,
    tokenLifetimeSeconds,
    subject,
    tokenType,
  }: {
    issuerUrl: string;
    audience: string | string[];
    tokenLifetimeSeconds: number;
    subject: string;
    tokenType: 'JWT' | 'at+jwt';
  },
) {
  const privateKey = await privateKeyPromise;
  const issuedAt = Math.floor(Date.now() / 1000);

  return new SignJWT(payload)
    .setProtectedHeader({
      alg: mockPrivateJwk.alg,
      kid: mockPrivateJwk.kid,
      typ: tokenType,
    })
    .setIssuer(issuerUrl)
    .setAudience(audience)
    .setSubject(subject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + tokenLifetimeSeconds)
    .setJti(crypto.randomUUID())
    .sign(privateKey);
}

/**
 * Verifies an access token issued by the mock provider and returns its
 * claims, or `undefined` when it is invalid or expired.
 */
async function verifyAccessToken(token: string, issuerUrl: string) {
  try {
    const { payload } = await jwtVerify(token, await publicKeyPromise, {
      issuer: issuerUrl,
      typ: 'at+jwt',
    });
    return payload;
  } catch {
    return undefined;
  }
}

function splitScope(scope: string | undefined) {
  return (scope ?? '').split(' ').filter(Boolean);
}

async function createTokenResponse<TClaims extends MockOidcClaimsSchema>(
  options: CreateOidcHandlersOptions<TClaims>,
  {
    scope,
    nonce,
    clientId,
  }: {
    scope: string | undefined;
    nonce: string | undefined;
    clientId: string;
  },
) {
  const { config } = options;
  const tokenLifetimeSeconds = options.tokenLifetimeSeconds ?? 60 * 60;
  const identity = await options.getIdentity();
  const context: MockOidcClaimsContext<TClaims> = {
    subject: identity.subject,
    claims: identity.claims,
    scopes: splitScope(scope),
    clientId,
  };

  const [idToken, accessToken] = await Promise.all([
    signJwt(
      {
        ...config.idTokenClaims(context),
        ...(nonce === undefined ? {} : { nonce }),
      },
      {
        issuerUrl: options.issuerUrl,
        audience: clientId,
        tokenLifetimeSeconds,
        subject: identity.subject,
        tokenType: 'JWT',
      },
    ),
    signJwt(
      {
        ...(scope === undefined ? {} : { scope }),
        client_id: clientId,
        ...config.accessTokenClaims(context),
      },
      {
        issuerUrl: options.issuerUrl,
        audience: config.accessTokenAudience ?? clientId,
        tokenLifetimeSeconds,
        subject: identity.subject,
        tokenType: 'at+jwt',
      },
    ),
  ]);

  return {
    access_token: accessToken,
    id_token: idToken,
    refresh_token: accessToken,
    token_type: 'Bearer',
    expires_in: tokenLifetimeSeconds,
    ...(scope === undefined ? {} : { scope }),
  };
}

const tokenResponseHeaders = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
};

function tokenError(error: string, errorDescription: string) {
  return HttpResponse.json(
    { error, error_description: errorDescription },
    { status: 400, headers: tokenResponseHeaders },
  );
}

function userInfoError(errorDescription?: string) {
  return new HttpResponse(null, {
    status: 401,
    headers: {
      'WWW-Authenticate':
        errorDescription === undefined
          ? 'Bearer'
          : `Bearer error="invalid_token", error_description="${errorDescription}"`,
    },
  });
}

export function createOidcHandlers<TClaims extends MockOidcClaimsSchema>(
  options: CreateOidcHandlersOptions<TClaims>,
): HttpHandler[] {
  const issuerUrl = options.issuerUrl.replace(/\/$/, '');
  const wellKnownUrl = `${issuerUrl}/.well-known/openid-configuration`;
  const tokenUrl = joinIssuerPath(
    issuerUrl,
    options.tokenEndpointPath ?? 'access_token',
  );
  const userInfoUrl = joinIssuerPath(
    issuerUrl,
    options.userInfoEndpointPath ?? 'userinfo',
  );
  const jwksUrl = joinIssuerPath(issuerUrl, options.jwksPath ?? 'jwks');
  const normalizedOptions = { ...options, issuerUrl };

  return [
    http.get(wellKnownUrl, () => {
      return HttpResponse.json(
        createWellKnownConfiguration(issuerUrl, options),
      );
    }),
    http.get(jwksUrl, () => {
      return HttpResponse.json(mockJwks);
    }),
    http.post(tokenUrl, async ({ request }) => {
      const formData = await request.formData();
      const getParameter = (name: string) => {
        const value = formData.get(name);
        return typeof value === 'string' && value.length > 0
          ? value
          : undefined;
      };
      const grantType = getParameter('grant_type') ?? 'authorization_code';
      const scope = getParameter('scope');
      // Public clients identify themselves in the token request.
      const clientId = getParameter('client_id') ?? options.clientId;

      if (grantType === 'refresh_token') {
        // Refresh tokens are access tokens; they keep the granted scope.
        const refreshToken = await verifyAccessToken(
          getParameter('refresh_token') ?? '',
          issuerUrl,
        );
        return HttpResponse.json(
          await createTokenResponse(normalizedOptions, {
            scope:
              scope ??
              (typeof refreshToken?.scope === 'string'
                ? refreshToken.scope
                : undefined),
            nonce: undefined,
            clientId,
          }),
          { headers: tokenResponseHeaders },
        );
      }

      if (grantType !== 'authorization_code') {
        return tokenError('unsupported_grant_type', `Unsupported grant_type ${grantType}`);
      }

      const code = decodeMockOidcAuthorizationCode(getParameter('code') ?? '');
      if (code === undefined) {
        return tokenError('invalid_grant', 'Unknown mock OIDC authorization code');
      }

      if (!(await verifyMockOidcCodeVerifier(code, getParameter('code_verifier')))) {
        return tokenError('invalid_grant', 'The PKCE code_verifier does not match');
      }

      return HttpResponse.json(
        await createTokenResponse(normalizedOptions, {
          scope: code.scope ?? scope,
          nonce: code.nonce,
          clientId,
        }),
        { headers: tokenResponseHeaders },
      );
    }),
    http.get(userInfoUrl, async ({ request }) => {
      const authorization = request.headers.get('Authorization');
      if (authorization === null || !/^Bearer /i.test(authorization)) {
        return userInfoError();
      }

      const accessToken = await verifyAccessToken(
        authorization.slice('Bearer '.length).trim(),
        issuerUrl,
      );
      if (accessToken === undefined) {
        return userInfoError('The access token is invalid or expired');
      }

      const identity = await options.getIdentity();
      return HttpResponse.json({
        ...options.config.userInfoClaims({
          subject: identity.subject,
          claims: identity.claims,
          scopes: splitScope(
            typeof accessToken.scope === 'string' ? accessToken.scope : undefined,
          ),
          clientId:
            typeof accessToken.client_id === 'string'
              ? accessToken.client_id
              : options.clientId,
        }),
        sub: identity.subject,
      });
    }),
  ];
}
