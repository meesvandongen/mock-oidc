import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { defineMockOidcConfig } from './config.js';
import { getMockOidcIdentity } from './identity.js';

const claims = z.object({
  name: z.string().min(1),
  permissions: z.array(z.enum(['app:read', 'app:write'])).default([]),
  teams: z.array(z.enum(['support', 'operations'])).default([]),
});

function createConfig() {
  return defineMockOidcConfig({
    defaultSubject: 'app-user',
    claims,
    users: [
      {
        subject: 'app-user',
        label: 'Application user',
        claims: { name: 'App User', permissions: ['app:read'] },
      },
    ],
  });
}

describe('mock OIDC config', () => {
  it('applies defaults and resolves user claims through the schema', () => {
    const config = createConfig();

    expect(config.authorizationEndpointPath).toBe('authorize');
    expect(config.endSessionEndpointPath).toBe('logout');
    expect(config.allowedRedirectOrigins).toEqual([]);
    expect(config.claims).toBe(claims);
    expect(config.users[0]?.claims).toEqual({
      name: 'App User',
      permissions: ['app:read'],
      teams: [],
    });
    expectTypeOf(config.users[0]!.claims).toEqualTypeOf<z.output<typeof claims>>();
  });

  it('merges identity overrides with user defaults and validates them', () => {
    const config = createConfig();

    expect(
      getMockOidcIdentity(config, 'app-user', {
        claims: { teams: ['operations'] },
      }),
    ).toEqual({
      subject: 'app-user',
      claims: {
        name: 'App User',
        permissions: ['app:read'],
        teams: ['operations'],
      },
    });
    expect(() =>
      getMockOidcIdentity(config, 'app-user', {
        // @ts-expect-error -- not a configured option
        claims: { permissions: ['app:delete'] },
      }),
    ).toThrow('Invalid mock OIDC claims for subject "app-user"');
  });

  it('requires all claims for subjects without a configured user', () => {
    const config = createConfig();

    expect(() => getMockOidcIdentity(config, 'someone-else')).toThrow(
      'Invalid mock OIDC claims for subject "someone-else"',
    );
    expect(
      getMockOidcIdentity(config, 'someone-else', {
        claims: { name: 'Someone' },
      }),
    ).toEqual({
      subject: 'someone-else',
      claims: { name: 'Someone', permissions: [], teams: [] },
    });
  });

  it('requires the default subject to be configured', () => {
    expect(() =>
      defineMockOidcConfig({
        defaultSubject: 'missing-user',
        claims: z.object({}),
        users: [{ subject: 'app-user', label: 'Application user' }],
      }),
    ).toThrow('The default subject must match a configured user');
  });

  it('rejects duplicate user subjects', () => {
    expect(() =>
      defineMockOidcConfig({
        defaultSubject: 'app-user',
        claims: z.object({}),
        users: [
          { subject: 'app-user', label: 'First user' },
          { subject: 'app-user', label: 'Second user' },
        ],
      }),
    ).toThrow('Duplicate mock OIDC user subject: app-user');
  });

  it('rejects user claims that do not match the schema', () => {
    expect(() =>
      defineMockOidcConfig({
        defaultSubject: 'app-user',
        claims,
        users: [
          {
            subject: 'app-user',
            label: 'Application user',
            // @ts-expect-error -- not a configured option
            claims: { name: 'App User', permissions: ['app:delete'] },
          },
        ],
      }),
    ).toThrow(/users.*0.*claims.*permissions/s);
  });

  it('rejects reserved claims in the schema', () => {
    expect(() =>
      defineMockOidcConfig({
        defaultSubject: 'app-user',
        claims: z.object({ sub: z.string() }),
        users: [{ subject: 'app-user', label: 'Application user', claims: { sub: 'x' } }],
      }),
    ).toThrow('must not define the reserved claim sub');
  });

  it('rejects claims that are not a zod object schema', () => {
    expect(() =>
      defineMockOidcConfig({
        defaultSubject: 'app-user',
        // @ts-expect-error -- claims must be a zod object
        claims: { name: 'string' },
        users: [{ subject: 'app-user', label: 'Application user' }],
      }),
    ).toThrow('Mock OIDC claims must be a zod object schema');
  });

  it('includes all claims in every output by default', () => {
    const config = createConfig();
    const context = {
      subject: 'app-user',
      claims: config.users[0]!.claims,
      scopes: ['openid'],
      clientId: 'app',
    };

    expect(config.accessTokenAudience).toBeUndefined();
    for (const mapping of [
      config.idTokenClaims,
      config.accessTokenClaims,
      config.userInfoClaims,
    ]) {
      expect(mapping(context)).toEqual(config.users[0]!.claims);
    }
  });

  it('turns claim name lists into mappings that pick those claims', () => {
    const config = defineMockOidcConfig({
      defaultSubject: 'app-user',
      accessTokenAudience: ['https://api.example.com'],
      claims: claims.extend({ team: z.string().optional() }),
      idTokenClaims: ['name', 'team'],
      userInfoClaims: ({ subject, claims, scopes }) => ({
        name: `${claims.name} (${subject})`,
        scopes,
      }),
      users: [{ subject: 'app-user', label: 'Application user', claims: { name: 'App User' } }],
    });
    const context = {
      subject: 'app-user',
      claims: config.users[0]!.claims,
      scopes: ['openid'],
      clientId: 'app',
    };

    expect(config.accessTokenAudience).toEqual(['https://api.example.com']);
    // Undefined optional claims are left out.
    expect(config.idTokenClaims(context)).toEqual({ name: 'App User' });
    expect(config.userInfoClaims(context)).toEqual({
      name: 'App User (app-user)',
      scopes: ['openid'],
    });
  });

  it('rejects claim name lists with claims the schema does not define', () => {
    expect(() =>
      defineMockOidcConfig({
        defaultSubject: 'app-user',
        claims,
        // @ts-expect-error -- not a claim of the schema
        accessTokenClaims: ['name', 'missing'],
        users: [{ subject: 'app-user', label: 'Application user', claims: { name: 'x' } }],
      }),
    ).toThrow(/Unknown claim missing.*accessTokenClaims.*1/s);
    expect(() =>
      defineMockOidcConfig({
        defaultSubject: 'app-user',
        claims,
        // @ts-expect-error -- not a claims mapping
        userInfoClaims: 'name',
        users: [{ subject: 'app-user', label: 'Application user', claims: { name: 'x' } }],
      }),
    ).toThrow();
  });

  it('rejects endpoint paths that leave the route root', () => {
    expect(() =>
      defineMockOidcConfig({
        authorizationEndpointPath: '../authorize/index.html',
        defaultSubject: 'app-user',
        claims: z.object({}),
        users: [{ subject: 'app-user', label: 'Application user' }],
      }),
    ).toThrow('Invalid mock OIDC endpoint path');
  });
});

describe('mock OIDC config with nested claims', () => {
  const nestedClaims = z.object({
    organization: z.object({
      name: z.string().min(1),
      address: z.object({
        city: z.string().min(1),
        country: z.enum(['NL', 'BE']).default('NL'),
      }),
    }),
    memberships: z
      .array(
        z.object({
          team: z.string().min(1),
          roles: z.array(z.enum(['member', 'lead'])).min(1),
          projects: z
            .array(z.object({ key: z.string(), archived: z.boolean().default(false) }))
            .default([]),
        }),
      )
      .default([]),
    group_paths: z.array(z.array(z.string())).default([]),
  });

  function createNestedConfig() {
    return defineMockOidcConfig({
      defaultSubject: 'carol',
      claims: nestedClaims,
      users: [
        {
          subject: 'carol',
          label: 'Carol',
          claims: {
            organization: { name: 'Acme', address: { city: 'Utrecht' } },
            memberships: [
              { team: 'platform', roles: ['lead'], projects: [{ key: 'API' }] },
              { team: 'support', roles: ['member'] },
            ],
            group_paths: [['acme', 'engineering']],
          },
        },
      ],
    });
  }

  it('applies defaults at every level of nesting', () => {
    expect(createNestedConfig().users[0]?.claims).toEqual({
      organization: { name: 'Acme', address: { city: 'Utrecht', country: 'NL' } },
      memberships: [
        {
          team: 'platform',
          roles: ['lead'],
          projects: [{ key: 'API', archived: false }],
        },
        { team: 'support', roles: ['member'], projects: [] },
      ],
      group_paths: [['acme', 'engineering']],
    });
  });

  it('reports the path of invalid values inside arrays of objects', () => {
    let error: unknown;
    try {
      defineMockOidcConfig({
        defaultSubject: 'carol',
        claims: nestedClaims,
        users: [
          {
            subject: 'carol',
            label: 'Carol',
            claims: {
              organization: { name: 'Acme', address: { city: 'Utrecht' } },
              memberships: [
                { team: 'platform', roles: ['lead'] },
                // @ts-expect-error -- not a configured option
                { team: 'support', roles: ['owner'] },
              ],
            },
          },
        ],
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(z.ZodError);
    expect((error as z.ZodError).issues.map((issue) => issue.path)).toEqual([
      ['users', 0, 'claims', 'memberships', 1, 'roles', 0],
    ]);
  });

  it('replaces nested claims as a whole when overriding them', () => {
    const config = createNestedConfig();

    // Overrides are merged one level deep: a nested claim replaces the
    // configured value, and is validated (and defaulted) as a whole.
    expect(
      getMockOidcIdentity(config, 'carol', {
        claims: { memberships: [{ team: 'security', roles: ['member'] }] },
      }).claims,
    ).toEqual({
      organization: { name: 'Acme', address: { city: 'Utrecht', country: 'NL' } },
      memberships: [{ team: 'security', roles: ['member'], projects: [] }],
      group_paths: [['acme', 'engineering']],
    });
    expect(() =>
      getMockOidcIdentity(config, 'carol', {
        // @ts-expect-error -- the override replaces the organization, so it needs a name
        claims: { organization: { address: { city: 'Delft' } } },
      }),
    ).toThrow('Invalid mock OIDC claims for subject "carol"');
  });

  it('includes nested claims in the userinfo', () => {
    const config = createNestedConfig();
    const identity = getMockOidcIdentity(config, 'carol');

    expect(
      config.userInfoClaims({ ...identity, scopes: [], clientId: 'app' }),
    ).toMatchObject({
      organization: { address: { city: 'Utrecht' } },
      memberships: [{ projects: [{ key: 'API' }] }, { team: 'support' }],
    });
  });
});
