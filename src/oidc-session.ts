import type { MockOidcClaimsSchema, MockOidcConfig } from './config.js';
import { getMockOidcIdentity, type MockOidcIdentity } from './identity.js';

export const mockOidcSubjectStorageKey = 'mock.oidc.subject';
export const mockOidcClaimsStorageKey = 'mock.oidc.claims';

/**
 * Returns the subject selected on the authorize page, or `undefined` when no
 * mock sign-in happened in this browser session.
 */
export function getStoredMockOidcSubject(browserWindow: Window) {
  return (
    browserWindow.sessionStorage.getItem(mockOidcSubjectStorageKey) ?? undefined
  );
}

export function getMockOidcSubjectFromWindow(
  browserWindow: Window,
  defaultSubject: string,
) {
  return getStoredMockOidcSubject(browserWindow) ?? defaultSubject;
}

export function setMockOidcSubjectInWindow(
  browserWindow: Window,
  subject: string,
) {
  if (subject.trim().length === 0) {
    throw new Error('The mock OIDC subject must not be empty');
  }

  browserWindow.sessionStorage.setItem(mockOidcSubjectStorageKey, subject);
}

function assertClaimsObject(
  claims: unknown,
): asserts claims is Record<string, unknown> {
  if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) {
    throw new Error('Mock OIDC claim selection must be an object');
  }
}

/**
 * Returns the raw claims stored by the authorize page. They are validated
 * against the claims schema by {@link getMockOidcIdentityFromWindow}.
 */
export function getMockOidcClaimsFromWindow(
  browserWindow: Window,
): Record<string, unknown> | undefined {
  const storedClaims = browserWindow.sessionStorage.getItem(
    mockOidcClaimsStorageKey,
  );

  if (storedClaims === null) {
    return undefined;
  }

  const claims: unknown = JSON.parse(storedClaims);
  assertClaimsObject(claims);

  return claims;
}

export function setMockOidcClaimsInWindow(
  browserWindow: Window,
  claims: Readonly<Record<string, unknown>>,
) {
  assertClaimsObject(claims);

  browserWindow.sessionStorage.setItem(
    mockOidcClaimsStorageKey,
    JSON.stringify(claims),
  );
}

/** Ends the mock sign-in session in this browser session. */
export function clearMockOidcSessionInWindow(browserWindow: Window) {
  browserWindow.sessionStorage.removeItem(mockOidcSubjectStorageKey);
  browserWindow.sessionStorage.removeItem(mockOidcClaimsStorageKey);
}

/**
 * Resolves the identity selected on the authorize page. Stored claims replace
 * the selected user's defaults and are validated with the claims schema.
 */
export function getMockOidcIdentityFromWindow<
  TClaims extends MockOidcClaimsSchema,
>(
  browserWindow: Window,
  config: MockOidcConfig<TClaims>,
): MockOidcIdentity<TClaims> {
  const subject = getMockOidcSubjectFromWindow(
    browserWindow,
    config.defaultSubject,
  );
  const storedClaims = getMockOidcClaimsFromWindow(browserWindow);

  if (storedClaims === undefined) {
    return getMockOidcIdentity(config, subject);
  }

  const claims = config.claims.safeParse(storedClaims);
  if (!claims.success) {
    throw new Error(
      `Invalid mock OIDC claims in session storage: ${claims.error.message}`,
      { cause: claims.error },
    );
  }

  return { subject, claims: claims.data as MockOidcIdentity<TClaims>['claims'] };
}
