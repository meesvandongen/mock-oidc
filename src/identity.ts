import type { MockOidcConfigInput } from './config.js';

export type MockOidcIdentity = {
  subject: string;
  claims: Record<string, string[]>;
};

export type MockOidcIdentityOverrides = {
  claims?: Readonly<Record<string, readonly string[]>>;
};

export function getMockOidcIdentity(
  config: MockOidcConfigInput,
  subject = config.defaultSubject,
  overrides: MockOidcIdentityOverrides = {},
): MockOidcIdentity {
  const user = config.users.find((candidate) => candidate.subject === subject);
  const selectors = config.claimSelectors ?? [];
  const selectorClaims = new Set(selectors.map((selector) => selector.claim));
  const unknownClaims = Object.keys(overrides.claims ?? {}).filter(
    (claim) => !selectorClaims.has(claim),
  );

  if (unknownClaims.length > 0) {
    throw new Error(
      `Mock OIDC claims are not configured as selectors: ${unknownClaims.join(', ')}`,
    );
  }

  const claims: Record<string, string[]> = {};

  for (const selector of selectors) {
    const selectedValues =
      overrides.claims?.[selector.claim] ??
      user?.claims?.[selector.claim] ??
      [];
    const unavailableValues = selectedValues.filter(
      (value) => !selector.options.includes(value),
    );

    if (
      new Set(selectedValues).size !== selectedValues.length ||
      unavailableValues.length > 0
    ) {
      throw new Error(
        `Mock OIDC claim "${selector.claim}" contains duplicate or unconfigured values for subject "${subject}"`,
      );
    }

    claims[selector.claim] = [...selectedValues];
  }

  return { subject, claims };
}
