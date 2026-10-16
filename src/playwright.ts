import type {
  BrowserContext,
  Fixtures,
  Page,
  PlaywrightTestArgs,
  PlaywrightTestOptions,
  Route,
  TestType,
} from '@playwright/test';
import { getResponse, type HttpHandler } from 'msw';
import type { z } from 'zod';
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
} from './identity.js';
import { createOidcHandlers, type OidcClaims } from './oidc-handlers.js';

/**
 * A mock user: the subject of a configured user, or a subject with claim
 * overrides that are merged over that user's defaults and validated with the
 * claims schema. Subjects without a configured user must supply every
 * required claim.
 */
export type MockOidcUser<TClaims extends MockOidcClaimsSchema> =
  | string
  | {
      subject?: string;
      claims?: Partial<z.input<TClaims>>;
    };

export type CreateMockOidcOptions<TClaims extends MockOidcClaimsSchema> = {
  config: MockOidcConfig<TClaims>;
  /** The issuer, e.g. the app origin. */
  issuerUrl: string;
  /** Audience of issued tokens when the token request has no `client_id`. */
  clientId: string;
  /** @default config.defaultSubject */
  user?: MockOidcUser<TClaims>;
  /**
   * Builds the userinfo and token claims for the current user.
   * @default the identity claims plus `sub`
   */
  getUserInfo?: (identity: MockOidcIdentity<TClaims>) => OidcClaims;
  tokenLifetimeSeconds?: number;
};

/** The parts of a Playwright `Page` or `BrowserContext` the mock uses. */
export type MockOidcRouter = Pick<Page | BrowserContext, 'route'>;

export type MockOidc<TClaims extends MockOidcClaimsSchema> = {
  /**
   * Routes every provider endpoint of a Playwright page or browser context:
   * discovery, JWKS, token and userinfo through the MSW handlers, and the
   * authorization and end session endpoints through redirects without UI.
   */
  install: (router: MockOidcRouter) => Promise<void>;
  /** The identity returned by the token and userinfo endpoints. */
  readonly user: MockOidcIdentity<TClaims>;
  /** Switches the user for subsequent sign-ins and token requests. */
  setUser: (user: MockOidcUser<TClaims>) => void;
  /** Whether the mock provider has a session, so `prompt=none` succeeds. */
  readonly signedIn: boolean;
  /**
   * Starts a provider session, optionally for another user, so silent
   * sign-ins (`prompt=none`) succeed without an interactive sign-in.
   */
  signIn: (user?: MockOidcUser<TClaims>) => void;
  /** Ends the provider session. */
  signOut: () => void;
  /** Prepends MSW handlers that override the provider's endpoints. */
  use: (...handlers: HttpHandler[]) => void;
  /** Removes the handlers added with {@link use}. */
  resetHandlers: () => void;
  /** Resolves an authorization request URL to the client redirect URL. */
  authorize: (requestUrl: string) => string;
  /** Resolves an end session request URL to the post logout redirect URL. */
  endSession: (requestUrl: string) => string | undefined;
};

const signedOutPage =
  '<!doctype html><title>Signed out</title><p>Signed out of the mock OIDC provider.</p>';

function redirect(location: string) {
  return { status: 302, headers: { location } };
}

async function toFetchRequest(route: Route) {
  const request = route.request();
  const body = request.postDataBuffer();

  return new Request(request.url(), {
    method: request.method(),
    headers: await request.allHeaders(),
    body: body === null ? undefined : new Uint8Array(body),
  });
}

async function fulfillWithResponse(route: Route, response: Response) {
  await route.fulfill({
    status: response.status,
    headers: Object.fromEntries(response.headers),
    body: Buffer.from(await response.arrayBuffer()),
  });
}

/**
 * A mock OIDC provider for Playwright. The user is kept in the test process,
 * so signing in needs neither the authorize page nor a service worker.
 */
export function createMockOidc<TClaims extends MockOidcClaimsSchema>(
  options: CreateMockOidcOptions<TClaims>,
): MockOidc<TClaims> {
  const { config } = options;
  const issuerUrl = new URL(options.issuerUrl.replace(/\/$/, ''));
  const issuer = issuerUrl.href.replace(/\/$/, '');
  const issuerPath = issuerUrl.pathname.replace(/\/$/, '');
  const endpointPath = (path: string) =>
    `${issuerPath}${normalizeMockOidcEndpointPath(path)}`;
  const authorizationPath = endpointPath(config.authorizationEndpointPath);
  const endSessionPath = endpointPath(config.endSessionEndpointPath);
  const handlerPaths = new Set(
    ['.well-known/openid-configuration', 'jwks', 'access_token', 'userinfo'].map(
      endpointPath,
    ),
  );
  const allowedRedirectOrigins = [
    issuerUrl.origin,
    ...config.allowedRedirectOrigins,
  ];
  const getUserInfo = options.getUserInfo ?? getMockOidcUserInfo;

  function resolveUser(user: MockOidcUser<TClaims> = config.defaultSubject) {
    return typeof user === 'string'
      ? getMockOidcIdentity(config, user)
      : getMockOidcIdentity(config, user.subject, { claims: user.claims });
  }

  let user = resolveUser(options.user);
  let signedIn = false;
  let overrides: HttpHandler[] = [];
  const handlers = createOidcHandlers({
    issuerUrl: issuer,
    clientId: options.clientId,
    authorizationEndpointPath: config.authorizationEndpointPath,
    endSessionEndpointPath: config.endSessionEndpointPath,
    tokenLifetimeSeconds: options.tokenLifetimeSeconds,
    getUserInfo: () => getUserInfo(user),
  });

  function isEndpoint(url: URL, path: string) {
    return url.origin === issuerUrl.origin && url.pathname === path;
  }

  function assertEndpoint(requestUrl: string, path: string) {
    const url = new URL(requestUrl);
    if (!isEndpoint(url, path)) {
      throw new Error(`Unexpected mock OIDC endpoint: ${url.origin}${url.pathname}`);
    }
  }

  const mockOidc: MockOidc<TClaims> = {
    async install(router) {
      await router.route(
        (url) =>
          url.origin === issuerUrl.origin &&
          (handlerPaths.has(url.pathname) ||
            overrides.length > 0 &&
              url.pathname.startsWith(`${issuerPath}/`)),
        async (route) => {
          const response = await getResponse(
            [...overrides, ...handlers],
            await toFetchRequest(route),
          );
          if (response === undefined) {
            await route.fallback();
            return;
          }
          await fulfillWithResponse(route, response);
        },
      );
      await router.route(
        (url) => isEndpoint(url, authorizationPath),
        (route) =>
          route.fulfill(redirect(mockOidc.authorize(route.request().url()))),
      );
      await router.route(
        (url) => isEndpoint(url, endSessionPath),
        (route) => {
          const location = mockOidc.endSession(route.request().url());
          return route.fulfill(
            location === undefined
              ? { status: 200, contentType: 'text/html', body: signedOutPage }
              : redirect(location),
          );
        },
      );
    },
    get user() {
      return user;
    },
    setUser(nextUser) {
      user = resolveUser(nextUser);
    },
    get signedIn() {
      return signedIn;
    },
    signIn(nextUser) {
      if (nextUser !== undefined) {
        user = resolveUser(nextUser);
      }
      signedIn = true;
    },
    signOut() {
      signedIn = false;
    },
    use(...nextHandlers) {
      overrides = [...nextHandlers, ...overrides];
    },
    resetHandlers() {
      overrides = [];
    },
    authorize(requestUrl) {
      assertEndpoint(requestUrl, authorizationPath);
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
      assertEndpoint(requestUrl, endSessionPath);
      signedIn = false;
      return createMockOidcEndSessionResponseUrl(
        requestUrl,
        allowedRedirectOrigins,
      );
    },
  };

  return mockOidc;
}

export type WithMockOidcOptions<TClaims extends MockOidcClaimsSchema> = Omit<
  CreateMockOidcOptions<TClaims>,
  'issuerUrl' | 'user'
> & {
  /** @default the project's `baseURL` */
  issuerUrl?: string;
};

export type MockOidcFixtures<TClaims extends MockOidcClaimsSchema> = {
  /** Option: the user that signs in, e.g. `test.use({ mockOidcUser: 'bob' })`. */
  mockOidcUser: MockOidcUser<TClaims>;
  /** The mock provider, installed on the test's browser context. */
  mockOidc: MockOidc<TClaims>;
};

/**
 * Extends a Playwright `test` with a mock OIDC provider on every browser
 * context. Pick the user with `test.use({ mockOidcUser })` and control the
 * provider through the `mockOidc` fixture.
 */
export function withMockOidc<
  TClaims extends MockOidcClaimsSchema,
  TestArgs extends PlaywrightTestArgs & PlaywrightTestOptions,
  WorkerArgs extends object,
>(
  test: TestType<TestArgs, WorkerArgs>,
  options: WithMockOidcOptions<TClaims>,
): TestType<TestArgs & MockOidcFixtures<TClaims>, WorkerArgs> {
  const fixtures: Fixtures<
    MockOidcFixtures<TClaims>,
    object,
    PlaywrightTestArgs & PlaywrightTestOptions
  > = {
    mockOidcUser: [options.config.defaultSubject, { option: true }],
    mockOidc: [
      async ({ context, baseURL, mockOidcUser }, use) => {
        const issuerUrl = options.issuerUrl ?? baseURL;
        if (issuerUrl === undefined) {
          throw new Error(
            'withMockOidc needs an issuerUrl option or a baseURL in the Playwright config',
          );
        }

        const mockOidc = createMockOidc({
          ...options,
          issuerUrl,
          user: mockOidcUser,
        });
        await mockOidc.install(context);
        await use(mockOidc);
      },
      { auto: true },
    ],
  };

  // The fixtures only depend on Playwright's built-in test arguments, which
  // every extended `test` still provides.
  return test.extend<MockOidcFixtures<TClaims>>(
    fixtures as Fixtures<MockOidcFixtures<TClaims>, object, TestArgs, WorkerArgs>,
  );
}
