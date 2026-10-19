import { z } from 'zod';
import type { MockOidcClaimsSchema } from '../config.js';

/**
 * Converts the claims schema into the JSON Schema used to rebuild the form
 * schema in the browser, with the subject as the first field.
 */
export function createMockOidcFormSchema(claims: MockOidcClaimsSchema) {
  const claimsSchema = z.toJSONSchema(claims, {
    io: 'input',
    unrepresentable: 'any',
  }) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };

  return {
    type: 'object',
    properties: {
      sub: { type: 'string', minLength: 1, title: 'Subject' },
      ...claimsSchema.properties,
    },
    required: ['sub', ...(claimsSchema.required ?? [])],
  };
}
