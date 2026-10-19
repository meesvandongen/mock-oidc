import type { z } from 'zod';
import type { MockOidcClaimsSchema, MockOidcConfig } from './config.js';

export type MockOidcIdentity<
  TClaims extends MockOidcClaimsSchema = MockOidcClaimsSchema,
> = {
  subject: string;
  claims: z.output<TClaims>;
};

export type MockOidcIdentityOverrides<TClaims extends MockOidcClaimsSchema> = {
  /**
   * Claim values merged over the configured user's defaults before they are
   * validated with the claims schema.
   */
  claims?: Partial<z.input<TClaims>>;
};

/**
 * Resolves the identity for a subject. Configured users provide default
 * claims; other subjects must supply every required claim as an override.
 */
export function getMockOidcIdentity<TClaims extends MockOidcClaimsSchema>(
  config: MockOidcConfig<TClaims>,
  subject: string = config.defaultSubject,
  overrides: MockOidcIdentityOverrides<TClaims> = {},
): MockOidcIdentity<TClaims> {
  const user = config.users.find((candidate) => candidate.subject === subject);
  const claims = config.claims.safeParse({
    ...user?.claims,
    ...overrides.claims,
  });

  if (!claims.success) {
    throw new Error(
      `Invalid mock OIDC claims for subject "${subject}": ${claims.error.message}`,
      { cause: claims.error },
    );
  }

  return { subject, claims: claims.data as z.output<TClaims> };
}
