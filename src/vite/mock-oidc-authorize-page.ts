import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import type { Plugin } from 'vite';
import { authorizePageScript } from '../authorize-page/bundle.generated.js';
import { createMockOidcFormSchema } from '../authorize-page/form-schema.js';
import {
  type MockOidcPageData,
  mockOidcPageDataElementId,
} from '../authorize-page/page-data.js';
import {
  type MockOidcClaimsSchema,
  type MockOidcConfig,
  normalizeMockOidcEndpointPath,
} from '../config.js';
import {
  mockOidcClaimsStorageKey,
  mockOidcSubjectStorageKey,
} from '../oidc-session.js';

export type MockOidcAuthorizePageOptions<
  TClaims extends MockOidcClaimsSchema = MockOidcClaimsSchema,
> = {
  enabled: boolean;
  /** Client build output directory that receives the static pages. */
  outputDirectory: string;
  config: MockOidcConfig<TClaims>;
};

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

export { createMockOidcFormSchema };

export function mockOidcAuthorizePage<TClaims extends MockOidcClaimsSchema>(
  options: MockOidcAuthorizePageOptions<TClaims>,
): Plugin | undefined {
  if (!options.enabled) {
    return undefined;
  }

  const { config } = options;
  const pages = new Map([
    [
      normalizeMockOidcEndpointPath(config.authorizationEndpointPath),
      renderMockOidcPage(config, 'authorize'),
    ],
    [
      normalizeMockOidcEndpointPath(config.endSessionEndpointPath),
      renderMockOidcPage(config, 'end-session'),
    ],
  ]);
  let projectRoot = process.cwd();
  let clientOutputDirectory: string | undefined;

  return {
    name: '@mvd/mock-oidc:authorize-page',
    configResolved(resolvedConfig) {
      projectRoot = resolvedConfig.root;
      clientOutputDirectory = resolve(projectRoot, options.outputDirectory);
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestPath = (request.url ?? '/').split('?', 1)[0] ?? '/';
        const page = pages.get(requestPath);
        if (
          page === undefined ||
          (request.method !== 'GET' && request.method !== 'HEAD')
        ) {
          return next();
        }

        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');

        if (request.method === 'HEAD') {
          response.end();
          return;
        }

        response.end(page);
      });
    },
    writeBundle(outputOptions) {
      if (!outputOptions.dir || !clientOutputDirectory) {
        return;
      }

      const outputDirectory = resolve(projectRoot, outputOptions.dir);
      if (outputDirectory !== clientOutputDirectory) {
        return;
      }

      for (const [pagePath, page] of pages) {
        const outputPath = resolve(clientOutputDirectory, pagePath.slice(1));
        const relativeOutputPath = relative(clientOutputDirectory, outputPath);

        if (
          relativeOutputPath === '..' ||
          relativeOutputPath.startsWith(`..${sep}`)
        ) {
          throw new Error(
            `Mock OIDC endpoint path escapes the client output directory: ${pagePath}`,
          );
        }

        mkdirSync(dirname(outputPath), { recursive: true });
        writeFileSync(outputPath, page, 'utf8');
      }
    },
  };
}
