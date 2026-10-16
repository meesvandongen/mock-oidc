import type { MockOidcConfigInput } from './config.js';
import { getMockOidcIdentity } from './identity.js';

export const mockOidcSubjectStorageKey = 'mock.oidc.subject';
export const mockOidcClaimsStorageKey = 'mock.oidc.claims';

export function getMockOidcSubjectFromWindow(
  browserWindow: Window,
  defaultSubject: string,
) {
  const storedSubject = browserWindow.sessionStorage.getItem(
    mockOidcSubjectStorageKey,
  );

  if (storedSubject !== null) {
    return storedSubject;
  }

  browserWindow.sessionStorage.setItem(
    mockOidcSubjectStorageKey,
    defaultSubject,
  );

  return defaultSubject;
}

export function setMockOidcSubjectInWindow(
  browserWindow: Window,
  subject: string,
) {
  browserWindow.sessionStorage.setItem(mockOidcSubjectStorageKey, subject);
}

function validateClaimSelections(
  claims: unknown,
): Record<string, string[]> {
  if (typeof claims !== 'object' || claims === null || Array.isArray(claims)) {
    throw new Error('Mock OIDC claim selection must be an object');
  }

  const validatedClaims: Record<string, string[]> = {};

  for (const [claim, values] of Object.entries(claims)) {
    if (
      !Array.isArray(values) ||
      !values.every(
        (value): value is string =>
          typeof value === 'string' && value.length > 0,
      ) ||
      new Set(values).size !== values.length
    ) {
      throw new Error(
        `Mock OIDC claim selection "${claim}" must be an array of unique non-empty strings`,
      );
    }

    validatedClaims[claim] = [...values];
  }

  return validatedClaims;
}

export function getMockOidcClaimsFromWindow(
  browserWindow: Window,
): Record<string, string[]> | undefined {
  const storedClaims = browserWindow.sessionStorage.getItem(
    mockOidcClaimsStorageKey,
  );

  if (storedClaims === null) {
    return undefined;
  }

  return validateClaimSelections(JSON.parse(storedClaims));
}

export function setMockOidcClaimsInWindow(
  browserWindow: Window,
  claims: Readonly<Record<string, readonly string[]>>,
) {
  const validatedClaims = validateClaimSelections(claims);

  browserWindow.sessionStorage.setItem(
    mockOidcClaimsStorageKey,
    JSON.stringify(validatedClaims),
  );
}

export function getMockOidcIdentityFromWindow(
  browserWindow: Window,
  config: MockOidcConfigInput,
) {
  const subject = getMockOidcSubjectFromWindow(
    browserWindow,
    config.defaultSubject,
  );

  return getMockOidcIdentity(config, subject, {
    claims: getMockOidcClaimsFromWindow(browserWindow),
  });
}
