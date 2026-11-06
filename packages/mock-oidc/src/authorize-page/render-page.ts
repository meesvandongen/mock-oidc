import type { MockOidcConfig } from '../config.js';
import {
  mockOidcClaimsStorageKey,
  mockOidcSubjectStorageKey,
} from '../oidc-session.js';
import { authorizePageScript } from './bundle.generated.js';
import { createMockOidcFormSchema } from './form-schema.js';
import {
  type MockOidcPageData,
  mockOidcPageDataElementId,
} from './page-data.js';

/**
 * Renders the self-contained authorize and end session pages. Shared by the
 * Vite plugin (Node.js) and the MSW page handlers (browser), so it must not
 * import Node.js built-ins.
 */

function serializeInlineScriptValue(value: unknown) {
  const serializedValue = JSON.stringify(value);
  if (serializedValue === undefined) {
    throw new Error('Mock OIDC page data is not serializable');
  }

  return serializedValue.replace(/</g, '\\u003c');
}

function createPageData(
  config: MockOidcConfig,
  page: MockOidcPageData['page'],
): MockOidcPageData {
  return {
    page,
    defaultSubject: config.defaultSubject,
    allowedRedirectOrigins: config.allowedRedirectOrigins,
    users: config.users.map((user) => ({
      subject: user.subject,
      label: user.label,
      claims: user.claims,
    })),
    formSchema: createMockOidcFormSchema(config.claims),
    storageKeys: {
      subject: mockOidcSubjectStorageKey,
      claims: mockOidcClaimsStorageKey,
    },
  };
}

export function renderMockOidcPage(
  config: MockOidcConfig,
  page: MockOidcPageData['page'],
) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="robots" content="noindex" />
    <title>${page === 'authorize' ? 'Mock OIDC login' : 'Mock OIDC logout'}</title>
  </head>
  <body>
    <script type="application/json" id="${mockOidcPageDataElementId}">${serializeInlineScriptValue(createPageData(config, page))}</script>
    <script>${authorizePageScript}</script>
  </body>
</html>
`;
}
