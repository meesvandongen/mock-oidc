import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { defineMockOidcConfig } from './config.js';
import { getMockOidcIdentity, getMockOidcUserInfo } from './identity.js';

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
      getMockOidcUserInfo(
        getMockOidcIdentity(config, 'someone-else', {
          claims: { name: 'Someone' },
        }),
      ),
    ).toEqual({ sub: 'someone-else', name: 'Someone', permissions: [], teams: [] });
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
