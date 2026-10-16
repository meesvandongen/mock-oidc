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
  }),
  users: [
    {
      subject: 'alice',
      label: 'Alice (reader)',
      claims: {
        name: 'Alice Example',
        email: 'alice@example.com',
        roles: ['reader'],
        department: 'support',
      },
    },
    {
      subject: 'bob',
      label: 'Bob (editor, admin)',
      claims: {
        name: 'Bob Example',
        email: 'bob@example.com',
        roles: ['editor', 'admin'],
      },
    },
  ],
});
