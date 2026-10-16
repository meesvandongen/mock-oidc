import { z } from 'zod';

const claimSelectorSchema = z
  .object({
    claim: z.string().trim().min(1),
    label: z.string().trim().min(1),
    options: z.array(z.string().trim().min(1)).min(1),
  })
  .strict()
  .superRefine((selector, context) => {
    if (new Set(selector.options).size !== selector.options.length) {
      context.addIssue({
        code: 'custom',
        message: 'Claim selector options must be unique',
        path: ['options'],
      });
    }
  });

const userSchema = z
  .object({
    subject: z.string().trim().min(1),
    label: z.string().trim().min(1),
    claims: z
      .record(z.string(), z.array(z.string().trim().min(1)))
      .default({}),
  })
  .strict();

function isValidAuthorizationEndpointPath(path: string) {
  const segments = path.split('/');

  return (
    path.length > 0 &&
    !path.includes('?') &&
    !path.includes('#') &&
    !segments.some((segment) => segment === '..' || segment === '.')
  );
}

export const mockOidcConfigSchema = z
  .object({
    authorizationEndpointPath: z
      .string()
      .default('authorize')
      .refine(isValidAuthorizationEndpointPath, {
        message: 'Invalid mock OIDC authorization endpoint path',
      }),
    defaultSubject: z.string().trim().min(1),
    allowedRedirectOrigins: z.array(z.string().url()).default([]),
    claimSelectors: z.array(claimSelectorSchema).default([]),
    users: z.array(userSchema).min(1),
  })
  .strict()
  .superRefine((config, context) => {
    const subjects = new Set<string>();
    const selectorClaims = new Set<string>();

    config.users.forEach((user, index) => {
      if (subjects.has(user.subject)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate mock OIDC user subject: ${user.subject}`,
          path: ['users', index, 'subject'],
        });
      }
      subjects.add(user.subject);
    });

    config.claimSelectors.forEach((selector, index) => {
      if (selectorClaims.has(selector.claim)) {
        context.addIssue({
          code: 'custom',
          message: `Duplicate mock OIDC claim selector ${selector.claim}`,
          path: ['claimSelectors', index, 'claim'],
        });
      }
      selectorClaims.add(selector.claim);
    });

    if (!subjects.has(config.defaultSubject)) {
      context.addIssue({
        code: 'custom',
        message: 'The default subject must match a configured user',
        path: ['defaultSubject'],
      });
    }

    config.users.forEach((user, userIndex) => {
      for (const claim of Object.keys(user.claims)) {
        if (!selectorClaims.has(claim)) {
          context.addIssue({
            code: 'custom',
            message: `Mock OIDC claim ${claim} has no selector`,
            path: ['users', userIndex, 'claims', claim],
          });
        }
      }

      config.claimSelectors.forEach((selector) => {
        const selectedValues = user.claims[selector.claim] ?? [];

        if (new Set(selectedValues).size !== selectedValues.length) {
          context.addIssue({
            code: 'custom',
            message: `Default values for claim ${selector.claim} must be unique`,
            path: ['users', userIndex, 'claims', selector.claim],
          });
        }

        if (selectedValues.some((value) => !selector.options.includes(value))) {
          context.addIssue({
            code: 'custom',
            message: `Default values for claim ${selector.claim} must be configured options`,
            path: ['users', userIndex, 'claims', selector.claim],
          });
        }
      });
    });
  });

export type MockOidcClaimSelector = z.output<typeof claimSelectorSchema>;
export type MockOidcConfig = z.output<typeof mockOidcConfigSchema>;

export type MockOidcClaimSelectorInput = {
  claim: string;
  label: string;
  options: readonly string[];
};

export type MockOidcUserInput = {
  subject: string;
  label: string;
  claims?: Readonly<Record<string, readonly string[]>>;
};

export type MockOidcConfigInput = {
  authorizationEndpointPath?: string;
  defaultSubject: string;
  allowedRedirectOrigins?: readonly string[];
  claimSelectors?: readonly MockOidcClaimSelectorInput[];
  users: readonly MockOidcUserInput[];
};

export function defineMockOidcConfig(
  config: MockOidcConfigInput,
): MockOidcConfig {
  return mockOidcConfigSchema.parse(config);
}

export function normalizeMockOidcAuthorizationPath(path: string) {
  if (!isValidAuthorizationEndpointPath(path)) {
    throw new Error(`Invalid mock OIDC authorization endpoint path: ${path}`);
  }

  return `/${path.replace(/^\/+/, '')}`;
}
