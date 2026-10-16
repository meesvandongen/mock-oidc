import { z } from 'zod';

/**
 * Zod object schema describing the claims that can be selected for a mock
 * user. The same schema validates configured user defaults, the values
 * submitted through the authorize page, and claims stored in the browser.
 */
export type MockOidcClaimsSchema = z.ZodObject;

export type MockOidcUser<TClaims extends MockOidcClaimsSchema> = {
  subject: string;
  label: string;
  claims: z.output<TClaims>;
};

export type MockOidcConfig<
  TClaims extends MockOidcClaimsSchema = MockOidcClaimsSchema,
> = {
  authorizationEndpointPath: string;
  endSessionEndpointPath: string;
  defaultSubject: string;
  allowedRedirectOrigins: string[];
  claims: TClaims;
  users: MockOidcUser<TClaims>[];
};

export type MockOidcUserInput<TClaims extends MockOidcClaimsSchema> = {
  subject: string;
  label: string;
  claims?: z.input<TClaims>;
};

export type MockOidcConfigInput<TClaims extends MockOidcClaimsSchema> = {
  authorizationEndpointPath?: string;
  endSessionEndpointPath?: string;
  defaultSubject: string;
  allowedRedirectOrigins?: readonly string[];
  claims: TClaims;
  users: readonly MockOidcUserInput<NoInfer<TClaims>>[];
};

/** Claim names that are derived from the selected subject and the token. */
export const reservedMockOidcClaims = [
  'sub',
  'iss',
  'aud',
  'exp',
  'iat',
  'nbf',
  'jti',
  'nonce',
] as const;

function isValidEndpointPath(path: string) {
  const segments = path.split('/');

  return (
    path.length > 0 &&
    !path.includes('?') &&
    !path.includes('#') &&
    !segments.some((segment) => segment === '..' || segment === '.')
  );
}

function isZodObject(value: unknown): value is MockOidcClaimsSchema {
  return value instanceof z.ZodObject;
}

const endpointPathSchema = z.string().refine(isValidEndpointPath, {
  message: 'Invalid mock OIDC endpoint path',
});

const userSchema = z
  .object({
    subject: z.string().trim().min(1),
    label: z.string().trim().min(1),
    claims: z.unknown().optional(),
  })
  .strict();

const configShapeSchema = z
  .object({
    authorizationEndpointPath: endpointPathSchema.default('authorize'),
    endSessionEndpointPath: endpointPathSchema.default('logout'),
    defaultSubject: z.string().trim().min(1),
    allowedRedirectOrigins: z.array(z.url()).default([]),
    claims: z.custom<MockOidcClaimsSchema>(isZodObject, {
      message: 'Mock OIDC claims must be a zod object schema',
    }),
    users: z.array(userSchema).min(1),
  })
  .strict();

function prefixIssues(
  issues: readonly z.core.$ZodIssue[],
  path: readonly PropertyKey[],
): z.core.$ZodIssue[] {
  return issues.map((issue) => ({ ...issue, path: [...path, ...issue.path] }));
}

/**
 * Validates a mock OIDC configuration and resolves every user's default
 * claims through the configured claims schema.
 */
export function defineMockOidcConfig<TClaims extends MockOidcClaimsSchema>(
  config: MockOidcConfigInput<TClaims>,
): MockOidcConfig<TClaims> {
  const shape = configShapeSchema.parse(config);
  const issues: z.core.$ZodIssue[] = [];
  const subjects = new Set<string>();
  const users: MockOidcUser<TClaims>[] = [];

  if (shape.authorizationEndpointPath === shape.endSessionEndpointPath) {
    issues.push({
      code: 'custom',
      message: 'The authorization and end session endpoint paths must differ',
      path: ['endSessionEndpointPath'],
      input: shape.endSessionEndpointPath,
    });
  }

  for (const claim of reservedMockOidcClaims) {
    if (claim in shape.claims.shape) {
      issues.push({
        code: 'custom',
        message: `The claims schema must not define the reserved claim ${claim}`,
        path: ['claims', claim],
        input: undefined,
      });
    }
  }

  shape.users.forEach((user, index) => {
    if (subjects.has(user.subject)) {
      issues.push({
        code: 'custom',
        message: `Duplicate mock OIDC user subject: ${user.subject}`,
        path: ['users', index, 'subject'],
        input: user.subject,
      });
    }
    subjects.add(user.subject);

    const claims = shape.claims.safeParse(user.claims ?? {});
    if (!claims.success) {
      issues.push(
        ...prefixIssues(claims.error.issues, ['users', index, 'claims']),
      );
      return;
    }

    users.push({
      subject: user.subject,
      label: user.label,
      claims: claims.data as z.output<TClaims>,
    });
  });

  if (!subjects.has(shape.defaultSubject)) {
    issues.push({
      code: 'custom',
      message: 'The default subject must match a configured user',
      path: ['defaultSubject'],
      input: shape.defaultSubject,
    });
  }

  if (issues.length > 0) {
    throw new z.ZodError(issues);
  }

  return {
    authorizationEndpointPath: shape.authorizationEndpointPath,
    endSessionEndpointPath: shape.endSessionEndpointPath,
    defaultSubject: shape.defaultSubject,
    allowedRedirectOrigins: shape.allowedRedirectOrigins,
    claims: config.claims,
    users,
  };
}

export function normalizeMockOidcEndpointPath(path: string) {
  if (!isValidEndpointPath(path)) {
    throw new Error(`Invalid mock OIDC endpoint path: ${path}`);
  }

  return `/${path.replace(/^\/+/, '')}`;
}
