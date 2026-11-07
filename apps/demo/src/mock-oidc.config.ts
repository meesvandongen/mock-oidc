import { defineMockOidcConfig } from '@mvd/mock-oidc/config';
import { z } from 'zod';

/** Audience for token requests without a client_id; every page uses its own. */
export const clientId = 'mock-oidc-e2e';

export const mockOidcConfig = defineMockOidcConfig({
  defaultSubject: 'alice',
  claims: z.object({
    name: z.string().min(1).meta({ title: 'Name' }),
    email: z.email().meta({ title: 'E-mail' }),
    roles: z
      .array(z.enum(['reader', 'editor', 'admin']))
      .meta({ title: 'Roles', description: 'Application roles of the user' }),
    department: z
      .enum(['engineering', 'support', 'sales'])
      .optional()
      .meta({ title: 'Department' }),
    email_verified: z.boolean().default(true).meta({ title: 'E-mail verified' }),
    // The standard OIDC address claim: a nested object.
    address: z
      .object({
        street_address: z.string().min(1).meta({ title: 'Street address' }),
        locality: z.string().min(1).meta({ title: 'City' }),
        country: z.enum(['NL', 'BE', 'DE']).meta({ title: 'Country' }),
      })
      .meta({ title: 'Address' }),
    // An array of objects, each with an array of enum values.
    tenants: z
      .array(
        z.object({
          id: z.string().min(1).meta({ title: 'Tenant ID' }),
          permissions: z
            .array(z.enum(['read', 'write', 'billing']))
            .min(1)
            .meta({ title: 'Permissions' }),
        }),
      )
      .default([])
      .meta({ title: 'Tenants', description: 'Tenants the user can access' }),
  }),
  // The ID token and userinfo carry every claim (the default); the access
  // token only what an API needs to authorize requests.
  accessTokenClaims: ['roles', 'tenants'],
  users: [
    {
      subject: 'alice',
      label: 'Alice (reader)',
      claims: {
        name: 'Alice Example',
        email: 'alice@example.com',
        roles: ['reader'],
        department: 'support',
        address: {
          street_address: 'Oudegracht 1',
          locality: 'Utrecht',
          country: 'NL',
        },
        tenants: [{ id: 'acme', permissions: ['read'] }],
      },
    },
    {
      subject: 'bob',
      label: 'Bob (editor, admin)',
      claims: {
        name: 'Bob Example',
        email: 'bob@example.com',
        roles: ['editor', 'admin'],
        address: {
          street_address: 'Grote Markt 1',
          locality: 'Antwerp',
          country: 'BE',
        },
        tenants: [
          { id: 'acme', permissions: ['read', 'write'] },
          { id: 'globex', permissions: ['billing'] },
        ],
      },
    },
  ],
});
