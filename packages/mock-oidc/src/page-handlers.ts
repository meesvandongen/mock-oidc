import { type HttpHandler, HttpResponse, http } from 'msw';
import { renderMockOidcPage } from './authorize-page/render-page.js';
import type { MockOidcClaimsSchema, MockOidcConfig } from './config.js';

export type CreateMockOidcPageHandlersOptions<
  TClaims extends MockOidcClaimsSchema = MockOidcClaimsSchema,
> = {
  /** The same issuer URL as passed to `createOidcHandlers`. */
  issuerUrl: string;
  /** Provides the endpoint paths and the users and claims of the form. */
  config: MockOidcConfig<TClaims>;
};

/**
 * MSW handlers that serve the authorize and end session pages, as an
 * alternative to the Vite plugin.
 *
 * They rely on MSW 3 intercepting page navigations in the service worker,
 * which only works for navigations started while a page of the app runs the
 * worker. A fresh tab, a typed URL or a reload of the authorize page is sent
 * to the server instead.
 */
export function createMockOidcPageHandlers<
  TClaims extends MockOidcClaimsSchema,
>(options: CreateMockOidcPageHandlersOptions<TClaims>): HttpHandler[] {
  const { config } = options;
  const issuerUrl = options.issuerUrl.replace(/\/$/, '');
  const pages = [
    [config.authorizationEndpointPath, 'authorize'],
    [config.endSessionEndpointPath, 'end-session'],
  ] as const;

  return pages.map(([endpointPath, page]) => {
    // Rendered on first use: the page embeds the claims form schema.
    let html: string | undefined;

    return http.get(`${issuerUrl}/${endpointPath.replace(/^\/+/, '')}`, () => {
      html ??= renderMockOidcPage(config, page);
      return new HttpResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    });
  });
}
