import type { HttpHandler } from 'msw';
import {
  type MockOidcConfigInput,
  mockOidcConfigSchema,
  normalizeMockOidcAuthorizationPath,
} from './config.js';
import type { MockOidcIdentity } from './identity.js';
import { createOidcHandlers, type OidcClaims } from './oidc-handlers.js';

export type CreateMockOidcPlaywrightAdapterOptions<
  TUserInfo extends OidcClaims,
> = {
  config: MockOidcConfigInput;
  issuerUrl: string;
  clientId: string;
  identity: MockOidcIdentity;
  getUserInfo: (identity: MockOidcIdentity) => TUserInfo;
};

export type MockOidcPlaywrightAdapter = {
  handlers: HttpHandler[];
  authorize: (requestUrl: string) => string;
};

export function createMockOidcPlaywrightAdapter<TUserInfo extends OidcClaims>(
  options: CreateMockOidcPlaywrightAdapterOptions<TUserInfo>,
): MockOidcPlaywrightAdapter {
  const config = mockOidcConfigSchema.parse(options.config);
  const issuerUrl = options.issuerUrl.replace(/\/$/, '');
  const authorizationPath = normalizeMockOidcAuthorizationPath(
    config.authorizationEndpointPath,
  );
  const allowedRedirectOrigins = new Set([
    new URL(issuerUrl).origin,
    ...config.allowedRedirectOrigins.map((origin) => new URL(origin).origin),
  ]);

  return {
    handlers: createOidcHandlers({
      issuerUrl,
      clientId: options.clientId,
      authorizationEndpointPath: config.authorizationEndpointPath,
      getUserInfo: () => options.getUserInfo(options.identity),
    }),
    authorize(requestUrl) {
      const authorizationRequest = new URL(requestUrl);
      if (authorizationRequest.pathname !== authorizationPath) {
        throw new Error(
          `Unexpected mock OIDC authorization path: ${authorizationRequest.pathname}`,
        );
      }

      const redirectUri = authorizationRequest.searchParams.get('redirect_uri');
      const state = authorizationRequest.searchParams.get('state');

      if (!redirectUri || !state) {
        throw new Error(
          'The mock OIDC authorization request requires redirect_uri and state',
        );
      }

      let redirectUrl: URL;
      try {
        redirectUrl = new URL(redirectUri);
      } catch {
        throw new Error(
          'The mock OIDC authorization request has an invalid redirect_uri',
        );
      }

      if (!allowedRedirectOrigins.has(redirectUrl.origin)) {
        throw new Error(
          `The mock OIDC redirect origin is not allowed: ${redirectUrl.origin}`,
        );
      }

      const responseMode =
        authorizationRequest.searchParams.get('response_mode') ?? 'query';
      if (responseMode !== 'query' && responseMode !== 'fragment') {
        throw new Error(`Unsupported mock OIDC response_mode: ${responseMode}`);
      }

      const responseParams =
        responseMode === 'fragment'
          ? new URLSearchParams(redirectUrl.hash.slice(1))
          : redirectUrl.searchParams;
      responseParams.set('code', 'mock-authorization-code');
      responseParams.set('state', state);

      if (responseMode === 'fragment') {
        redirectUrl.hash = responseParams.toString();
      }

      return redirectUrl.toString();
    },
  };
}
