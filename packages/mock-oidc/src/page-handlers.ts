import { type HttpHandler, HttpResponse, http } from 'msw';
import { renderMockOidcPage } from './authorize-page/render-page.js';
import type { MockOidcClaimsSchema, MockOidcConfig } from './config.js';

/**
 * Serves the authorize and end session pages. Browsers send these as page
 * navigations, which the MSW 3 service worker hands to a page that runs MSW.
 */
export function createOidcPageHandlers<TClaims extends MockOidcClaimsSchema>({
  issuerUrl,
  config,
}: {
  issuerUrl: string;
  config: MockOidcConfig<TClaims>;
}): HttpHandler[] {
  const pages = [
    [config.authorizationEndpointPath, 'authorize'],
    [config.endSessionEndpointPath, 'end-session'],
  ] as const;

  return pages.map(([endpointPath, page]) => {
    // Rendered on first use: the page embeds the claims form schema.
    let html: string | undefined;

    return http.get(
      `${issuerUrl.replace(/\/$/, '')}/${endpointPath.replace(/^\/+/, '')}`,
      () => {
        html ??= renderMockOidcPage(config, page);
        return new HttpResponse(html, {
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
          },
        });
      },
    );
  });
}
