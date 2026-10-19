import type { ParsedField } from '@autoform/core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createMockOidcFormSchema } from '../form-schema.js';
import { MockOidcSchemaProvider } from './autoform.js';

const claims = z.object({
  organization: z
    .object({
      name: z.string().min(1).meta({ title: 'Organization name' }),
      address: z.object({
        city: z.string().min(1).meta({ title: 'City' }),
        country: z.enum(['NL', 'BE']).optional(),
      }),
    })
    .meta({ title: 'Organization' }),
  memberships: z
    .array(
      z.object({
        team: z.string().min(1).meta({ title: 'Team' }),
        roles: z.array(z.enum(['member', 'lead'])).meta({ title: 'Team roles' }),
        projects: z
          .array(
            z.object({
              key: z.string().min(1).meta({ title: 'Project key' }),
              archived: z.boolean().default(false),
            }),
          )
          .default([])
          .meta({ title: 'Projects' }),
      }),
    )
    .meta({ title: 'Memberships' }),
  group_paths: z.array(z.array(z.string())).default([]).meta({ title: 'Group paths' }),
});

const validClaims = {
  organization: { name: 'Acme', address: { city: 'Utrecht' } },
  memberships: [
    { team: 'platform', roles: ['lead'], projects: [{ key: 'API' }] },
    { team: 'support', roles: ['member'] },
  ],
  group_paths: [['acme', 'engineering']],
};

/** Finds a parsed AutoForm field by its path, `0` being an array's item. */
function getField(fields: ParsedField[], ...path: string[]): ParsedField {
  const [key, ...rest] = path;
  const field = fields.find((candidate) => candidate.key === key);
  if (!field) {
    throw new Error(`No parsed field ${key}`);
  }
  return rest.length === 0 ? field : getField(field.schema ?? [], ...rest);
}

function createProvider() {
  return new MockOidcSchemaProvider(createMockOidcFormSchema(claims));
}

describe('MockOidcSchemaProvider with nested claims', () => {
  it('rebuilds a zod schema that validates nested values like the claims schema', () => {
    const formSchema = createProvider().getSchema();

    expect(formSchema.parse({ sub: 'carol', ...validClaims })).toEqual({
      sub: 'carol',
      ...claims.parse(validClaims),
    });

    const invalidClaims = {
      ...validClaims,
      memberships: [
        { team: 'platform', roles: ['owner'], projects: [{ key: '' }] },
      ],
      group_paths: [['acme', 42]],
    };
    const paths = (schema: z.ZodType) =>
      schema.safeParse({ sub: 'carol', ...invalidClaims }).error?.issues.map(
        (issue) => issue.path,
      );

    expect(paths(formSchema)).toEqual([
      ['memberships', 0, 'roles', 0],
      ['memberships', 0, 'projects', 0, 'key'],
      ['group_paths', 0, 1],
    ]);
    expect(paths(formSchema)).toEqual(paths(claims));
  });

  it('labels fields at every level of nesting', () => {
    const { fields } = createProvider().parseSchema();
    const label = (...path: string[]) =>
      getField(fields, ...path).fieldConfig?.label;

    expect(label('organization')).toBe('Organization');
    expect(label('organization', 'name')).toBe('Organization name');
    expect(label('organization', 'address', 'city')).toBe('City');
    expect(label('memberships', '0')).toBe('Memberships item');
    expect(label('memberships', '0', 'team')).toBe('Team');
    expect(label('memberships', '0', 'projects', '0')).toBe('Projects item');
    expect(label('memberships', '0', 'projects', '0', 'key')).toBe('Project key');
    // Untitled array items are named after the array they are part of.
    expect(label('group_paths', '0')).toBe('Group paths item');
    expect(label('group_paths', '0', '0')).toBe('Group paths item item');
  });

  it('renders arrays of enum values inside arrays of objects as checkbox groups', () => {
    const { fields } = createProvider().parseSchema();

    expect(getField(fields, 'memberships', '0', 'roles')).toMatchObject({
      type: 'multiselect',
      options: [
        ['member', 'member'],
        ['lead', 'lead'],
      ],
    });
    expect(getField(fields, 'memberships', '0', 'projects').type).toBe('array');
  });
});
