import type { HttpHandler } from 'msw';
import {
  createMockOidcAuthorizationCode,
  createMockOidcAuthorizationResponseUrl,
  createMockOidcEndSessionResponseUrl,
  parseMockOidcAuthorizationRequest,
} from './authorization.js';
import {
  type MockOidcClaimsSchema,
  type MockOidcConfig,
  normalizeMockOidcEndpointPath,
} from './config.js';
import {
  getMockOidcIdentity,
  getMockOidcUserInfo,
  type MockOidcIdentity,
  type MockOidcIdentityOverrides,
} from './identity.js';
import { createOidcHandlers, type OidcClaims } from './oidc-handlers.js';

export type CreateMockOidcPlaywrightAdapterOptions<
  TClaims extends MockOidcClaimsSchema,
  TUserInfo extends OidcClaims,
> = {
  config: MockOidcConfig<TClaims>;
  issuerUrl: string;
  clientId: string;
  /**
   * The subject signed in by the adapter.
   * @default config.defaultSubject
   */
  subject?: string;
  /**
   * Claim values merged over the subject's configured defaults and validated
   * with the claims schema.
   */
  claims?: MockOidcIdentityOverrides<TClaims>['claims'];
  /**
   * Builds the userinfo and token claims for the current identity.
   * Defaults to the identity claims plus `sub`.
   */
  getUserInfo?: (identity: MockOidcIdentity<TClaims>) => TUserInfo;
  /**
   * Whether the identity already has a session at the mock provider, so
   * `prompt=none` requests succeed before an interactive sign-in.
   * @default false
   */
  signedIn?: boolean;
  tokenLifetimeSeconds?: number;
};

/** The subset of a Playwright `Route` used by the adapter. */
export type MockOidcPlaywrightRoute = {
  request(): { url(): string };
  fulfill(response: {
    status: number;
    headers?: Record<string, string>;
    contentType?: string;
    body?: string;
  }): Promise<void>;
};

/** A Playwright `Page` or `BrowserContext`. */
export type MockOidcPlaywrightRouter = {
  route(
    url: (url: URL) => boolean,
    handler: (route: MockOidcPlaywrightRoute) => Promise<void> | void,
  ): Promise<unknown>;
};

export type MockOidcPlaywrightAdapter<TClaims extends MockOidcClaimsSchema> = {
  /** MSW handlers for discovery, JWKS, token and userinfo endpoints. */
  handlers: HttpHandler[];
  /** Resolves an authorization request URL to the client redirect URL. */
  authorize: (requestUrl: string) => string;
  /** Resolves an end session request URL to the post logout redirect URL. */
  endSession: (requestUrl: string) => string | undefined;
  /**
   * Routes the authorization and end session endpoints of a Playwright page
   * or browser context through {@link authorize} and {@link endSession}.
   */
  route: (router: MockOidcPlaywrightRouter) => Promise<void>;
  /** The identity returned by the token and userinfo endpoints. */
  readonly identity: MockOidcIdentity<TClaims>;
  /**
   * Switches the identity used for subsequent sign-ins and token requests.
   * Overrides are merged over the subject's configured claims.
   */
  setIdentity: (
    subject: string,
    overrides?: MockOidcIdentityOverrides<TClaims>,
  ) => void;
  /** Whether the mock provider currently has a session. */
  readonly signedIn: boolean;
};

function redirect(location: string) {
  return { status: 302, headers: { location } };
}

export function createMockOidcPlaywrightAdapter<
  TClaims extends MockOidcClaimsSchema,
  TUserInfo extends OidcClaims = ReturnType<
    typeof getMockOidcUserInfo<TClaims>
  >,
>(
  options: CreateMockOidcPlaywrightAdapterOptions<TClaims, TUserInfo>,
): MockOidcPlaywrightAdapter<TClaims> {
  const { config } = options;
  const issuerUrl = options.issuerUrl.replace(/\/$/, '');
  const issuerOrigin = new URL(issuerUrl).origin;
  const issuerPath = new URL(issuerUrl).pathname.replace(/\/$/, '');
  const authorizationPath = `${issuerPath}${normalizeMockOidcEndpointPath(
    config.authorizationEndpointPath,
  )}`;
  const endSessionPath = `${issuerPath}${normalizeMockOidcEndpointPath(
    config.endSessionEndpointPath,
  )}`;
  const allowedRedirectOrigins = [
    issuerOrigin,
    ...config.allowedRedirectOrigins,
  ];
  const getUserInfo =
    options.getUserInfo ??
    ((identity: MockOidcIdentity<TClaims>) =>
      getMockOidcUserInfo(identity) as unknown as TUserInfo);
  let identity = getMockOidcIdentity(config, options.subject, {
    claims: options.claims,
  });
  let signedIn = options.signedIn ?? false;

  function assertPath(requestUrl: string, expectedPath: string) {
    const url = new URL(requestUrl);
    if (url.origin !== issuerOrigin || url.pathname !== expectedPath) {
      throw new Error(`Unexpected mock OIDC endpoint: ${url.origin}${url.pathname}`);
    }
  }

  const adapter: MockOidcPlaywrightAdapter<TClaims> = {
    handlers: createOidcHandlers({
      issuerUrl,
      clientId: options.clientId,
      authorizationEndpointPath: config.authorizationEndpointPath,
      endSessionEndpointPath: config.endSessionEndpointPath,
      tokenLifetimeSeconds: options.tokenLifetimeSeconds,
      getUserInfo: () => getUserInfo(identity),
    }),
    authorize(requestUrl) {
      assertPath(requestUrl, authorizationPath);
      const request = parseMockOidcAuthorizationRequest(
        requestUrl,
        allowedRedirectOrigins,
      );

      if (request.prompt.includes('none') && !signedIn) {
        return createMockOidcAuthorizationResponseUrl(request, {
          error: 'login_required',
          errorDescription: 'The mock OIDC provider has no session',
        });
      }

      signedIn = true;
      return createMockOidcAuthorizationResponseUrl(request, {
        code: createMockOidcAuthorizationCode(request),
      });
    },
    endSession(requestUrl) {
      assertPath(requestUrl, endSessionPath);
      signedIn = false;
      return createMockOidcEndSessionResponseUrl(
        requestUrl,
        allowedRedirectOrigins,
      );
    },
    async route(router) {
      await router.route(
        (url) =>
          url.origin === issuerOrigin && url.pathname === authorizationPath,
        (route) => route.fulfill(redirect(adapter.authorize(route.request().url()))),
      );
      await router.route(
        (url) => url.origin === issuerOrigin && url.pathname === endSessionPath,
        (route) => {
          const location = adapter.endSession(route.request().url());
          return route.fulfill(
            location === undefined
              ? {
                  status: 200,
                  contentType: 'text/html',
                  body: '<!doctype html><title>Signed out</title><p>Signed out</p>',
                }
              : redirect(location),
          );
        },
      );
    },
    get identity() {
      return identity;
    },
    setIdentity(subject, overrides) {
      identity = getMockOidcIdentity(config, subject, overrides);
    },
    get signedIn() {
      return signedIn;
    },
  };

  return adapter;
}
