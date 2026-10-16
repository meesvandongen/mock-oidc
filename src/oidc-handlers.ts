import { importJWK, SignJWT } from 'jose';
import { type HttpHandler, HttpResponse, http } from 'msw';

export type OidcClaims = Record<string, unknown> & {
  sub: string;
};

export type CreateOidcHandlersOptions<
  TUserInfo extends OidcClaims,
  TTokenClaims extends OidcClaims = TUserInfo,
> = {
  issuerUrl: string;
  clientId: string;
  getUserInfo: () => TUserInfo;
  getTokenClaims?: (userInfo: TUserInfo) => TTokenClaims;
  tokenLifetimeSeconds?: number;
  authorizationEndpointPath?: string;
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

function joinIssuerPath(issuerUrl: string, endpointPath: string) {
  return `${issuerUrl}/${endpointPath.replace(/^\/+/, '')}`;
}

function createWellKnownConfiguration(
  issuerUrl: string,
  options: Pick<
    CreateOidcHandlersOptions<OidcClaims>,
    | 'authorizationEndpointPath'
    | 'tokenEndpointPath'
    | 'userInfoEndpointPath'
    | 'jwksPath'
  >,
) {
  const authorizationEndpointPath =
    options.authorizationEndpointPath ?? 'authorize';
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
    response_types_supported: ['code'],
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
    clientId,
    tokenLifetimeSeconds,
    subject,
    tokenType,
  }: {
    issuerUrl: string;
    clientId: string;
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
    .setAudience(clientId)
    .setSubject(subject)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + tokenLifetimeSeconds)
    .setJti(crypto.randomUUID())
    .sign(privateKey);
}

async function createTokenResponse<
  TUserInfo extends OidcClaims,
  TTokenClaims extends OidcClaims,
>(
  options: CreateOidcHandlersOptions<TUserInfo, TTokenClaims>,
  scope: string | undefined,
) {
  const tokenLifetimeSeconds = options.tokenLifetimeSeconds ?? 60 * 60;
  const userInfo = options.getUserInfo();
  const tokenClaims = options.getTokenClaims?.(userInfo) ?? userInfo;

  const [idToken, accessToken] = await Promise.all([
    signJwt(tokenClaims, {
      issuerUrl: options.issuerUrl,
      clientId: options.clientId,
      tokenLifetimeSeconds,
      subject: tokenClaims.sub,
      tokenType: 'JWT',
    }),
    signJwt(tokenClaims, {
      issuerUrl: options.issuerUrl,
      clientId: options.clientId,
      tokenLifetimeSeconds,
      subject: tokenClaims.sub,
      tokenType: 'at+jwt',
    }),
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

export function createOidcHandlers<
  TUserInfo extends OidcClaims,
  TTokenClaims extends OidcClaims = TUserInfo,
>(options: CreateOidcHandlersOptions<TUserInfo, TTokenClaims>): HttpHandler[] {
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
      const requestedScope = formData.get('scope');
      const scope =
        typeof requestedScope === 'string' && requestedScope.length > 0
          ? requestedScope
          : undefined;

      return HttpResponse.json(
        await createTokenResponse(normalizedOptions, scope),
      );
    }),
    http.get(userInfoUrl, () => {
      return HttpResponse.json(options.getUserInfo());
    }),
  ];
}
