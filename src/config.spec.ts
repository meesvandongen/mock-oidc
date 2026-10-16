import { describe, expect, it } from 'vitest';
import { defineMockOidcConfig } from './config.js';
import { getMockOidcIdentity } from './identity.js';

describe('mock OIDC config', () => {
  it('applies generic defaults and retains configured claims', () => {
    const config = defineMockOidcConfig({
      defaultSubject: 'app-user',
      claimSelectors: [
        {
          claim: 'permissions',
          label: 'Permissions',
          options: ['app:read', 'app:write'],
        },
      ],
      users: [
        {
          subject: 'app-user',
          label: 'Application user',
          claims: {
            permissions: ['app:read'],
          },
        },
      ],
    });

    expect(config.authorizationEndpointPath).toBe('authorize');
    expect(config.allowedRedirectOrigins).toEqual([]);
    expect(config.users[0]?.claims).toEqual({ permissions: ['app:read'] });
  });

  it('supports arbitrary claim names and validates selected values', () => {
    const config = defineMockOidcConfig({
      defaultSubject: 'app-user',
      claimSelectors: [
        {
          claim: 'permissions',
          label: 'Permissions',
          options: ['app:read', 'app:write'],
        },
        {
          claim: 'teams',
          label: 'Teams',
          options: ['support', 'operations'],
        },
      ],
      users: [
        {
          subject: 'app-user',
          label: 'Application user',
          claims: {
            permissions: ['app:read'],
            teams: ['support'],
          },
        },
      ],
    });

    expect(
      getMockOidcIdentity(config, 'app-user', {
        claims: {
          permissions: ['app:write'],
          teams: ['operations'],
        },
      }),
    ).toEqual({
      subject: 'app-user',
      claims: {
        permissions: ['app:write'],
        teams: ['operations'],
      },
    });
    expect(() =>
      getMockOidcIdentity(config, 'app-user', {
        claims: { permissions: ['app:delete'] },
      }),
    ).toThrow('contains duplicate or unconfigured values');
    expect(() =>
      getMockOidcIdentity(config, 'app-user', {
        claims: { unknown: ['value'] },
      }),
    ).toThrow('are not configured as selectors');
  });

  it('requires the default subject to be configured', () => {
    expect(() =>
      defineMockOidcConfig({
        defaultSubject: 'missing-user',
        users: [{ subject: 'app-user', label: 'Application user' }],
      }),
    ).toThrow('The default subject must match a configured user');
  });

  it('rejects duplicate user subjects', () => {
    expect(() =>
      defineMockOidcConfig({
        defaultSubject: 'app-user',
        users: [
          { subject: 'app-user', label: 'First user' },
          { subject: 'app-user', label: 'Second user' },
        ],
      }),
    ).toThrow('Duplicate mock OIDC user subject: app-user');
  });

  it('rejects default claim values outside the selector options', () => {
    expect(() =>
      defineMockOidcConfig({
        defaultSubject: 'app-user',
        claimSelectors: [
          {
            claim: 'permissions',
            label: 'Permissions',
            options: ['app:read'],
          },
        ],
        users: [
          {
            subject: 'app-user',
            label: 'Application user',
            claims: { permissions: ['app:write'] },
          },
        ],
      }),
    ).toThrow('must be configured options');
  });

  it('rejects defaults for claims without selectors', () => {
    expect(() =>
      defineMockOidcConfig({
        defaultSubject: 'app-user',
        users: [
          {
            subject: 'app-user',
            label: 'Application user',
            claims: { permissions: ['app:read'] },
          },
        ],
      }),
    ).toThrow('has no selector');
  });
});
