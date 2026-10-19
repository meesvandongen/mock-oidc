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

/** What the claim mappings know about the request they build claims for. */
export type MockOidcClaimsContext<
  TClaims extends MockOidcClaimsSchema = MockOidcClaimsSchema,
> = {
  subject: string;
  /** The identity's claims, validated with the claims schema. */
  claims: z.output<TClaims>;
  /** The granted scope values, e.g. `['openid', 'email']`. */
  scopes: readonly string[];
  /** The client the tokens are issued to. */
  clientId: string;
};

/** Builds the claims of an ID token, access token or userinfo response. */
export type MockOidcClaimsMapper<
  TClaims extends MockOidcClaimsSchema = MockOidcClaimsSchema,
> = (context: MockOidcClaimsContext<TClaims>) => Record<string, unknown>;

/**
 * Either the names of the claims to include, or a function that builds the
 * claims from the identity and the request.
 */
export type MockOidcClaimsMapping<TClaims extends MockOidcClaimsSchema> =
  | readonly (keyof z.output<TClaims> & string)[]
  | MockOidcClaimsMapper<TClaims>;

export type MockOidcConfig<
  TClaims extends MockOidcClaimsSchema = MockOidcClaimsSchema,
> = {
  authorizationEndpointPath: string;
  endSessionEndpointPath: string;
  defaultSubject: string;
  allowedRedirectOrigins: string[];
  /** Audience of access tokens; the client ID when undefined. */
  accessTokenAudience: string | string[] | undefined;
  claims: TClaims;
  idTokenClaims: MockOidcClaimsMapper<TClaims>;
  accessTokenClaims: MockOidcClaimsMapper<TClaims>;
  userInfoClaims: MockOidcClaimsMapper<TClaims>;
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
  /**
   * Audience of access tokens, e.g. the API that accepts them.
   * @default the client ID
   */
  accessTokenAudience?: string | readonly string[];
  claims: TClaims;
  /**
   * Claims of the ID token, besides `sub`, `iss`, `aud`, `exp`, `iat`, `jti`
   * and `nonce`.
   * @default all claims
   */
  idTokenClaims?: MockOidcClaimsMapping<NoInfer<TClaims>>;
  /**
   * Claims of the access token, besides `sub`, `iss`, `aud`, `exp`, `iat` and
   * `jti`. `scope` and `client_id` are added unless the mapping returns them.
   * @default all claims
   */
  accessTokenClaims?: MockOidcClaimsMapping<NoInfer<TClaims>>;
  /**
   * Claims of the userinfo response, besides `sub`.
   * @default all claims
   */
  userInfoClaims?: MockOidcClaimsMapping<NoInfer<TClaims>>;
  users: readonly MockOidcUserInput<NoInfer<TClaims>>[];
};

const claimsMappingKeys = [
  'idTokenClaims',
  'accessTokenClaims',
  'userInfoClaims',
] as const;

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

const claimsMappingSchema = z
  .union([
    z.array(z.string()),
    z.custom<MockOidcClaimsMapper>((value) => typeof value === 'function', {
      message: 'A claims mapping must be an array of claim names or a function',
    }),
  ])
  .optional();

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
    accessTokenAudience: z
      .union([z.string().min(1), z.array(z.string().min(1)).min(1)])
      .optional(),
    claims: z.custom<MockOidcClaimsSchema>(isZodObject, {
      message: 'Mock OIDC claims must be a zod object schema',
    }),
    idTokenClaims: claimsMappingSchema,
    accessTokenClaims: claimsMappingSchema,
    userInfoClaims: claimsMappingSchema,
    users: z.array(userSchema).min(1),
  })
  .strict();

function prefixIssues(
  issues: readonly z.core.$ZodIssue[],
  path: readonly PropertyKey[],
): z.core.$ZodIssue[] {
  return issues.map((issue) => ({ ...issue, path: [...path, ...issue.path] }));
}

function allClaims({ claims }: MockOidcClaimsContext): Record<string, unknown> {
  return { ...claims };
}

function pickClaims(names: readonly string[]): MockOidcClaimsMapper {
  return ({ claims }) =>
    Object.fromEntries(
      names
        .filter((name) => claims[name] !== undefined)
        .map((name) => [name, claims[name]]),
    );
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

  for (const key of claimsMappingKeys) {
    const mapping = shape[key];
    if (!Array.isArray(mapping)) {
      continue;
    }

    mapping.forEach((name, index) => {
      if (!(name in shape.claims.shape)) {
        issues.push({
          code: 'custom',
          message: `Unknown claim ${name}; it is not defined by the claims schema`,
          path: [key, index],
          input: name,
        });
      }
    });
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
    accessTokenAudience: shape.accessTokenAudience,
    claims: config.claims,
    idTokenClaims: toClaimsMapper(config.idTokenClaims),
    accessTokenClaims: toClaimsMapper(config.accessTokenClaims),
    userInfoClaims: toClaimsMapper(config.userInfoClaims),
    users,
  };
}

function toClaimsMapper<TClaims extends MockOidcClaimsSchema>(
  mapping: MockOidcClaimsMapping<TClaims> | undefined,
): MockOidcClaimsMapper<TClaims> {
  if (mapping === undefined) {
    return allClaims;
  }

  return typeof mapping === 'function' ? mapping : pickClaims(mapping);
}

export function normalizeMockOidcEndpointPath(path: string) {
  if (!isValidEndpointPath(path)) {
    throw new Error(`Invalid mock OIDC endpoint path: ${path}`);
  }

  return `/${path.replace(/^\/+/, '')}`;
}
