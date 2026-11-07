import type { HttpHandler } from 'msw';
import {
  type CreateOidcHandlersOptions,
  createOidcApiHandlers,
} from './api-handlers.js';
import type { MockOidcClaimsSchema } from './config.js';
import { createOidcPageHandlers } from './page-handlers.js';

export type { CreateOidcHandlersOptions };

/**
 * MSW handlers for the whole mock provider: the authorize and end session
 * pages, and the discovery, JWKS, token and userinfo endpoints.
 *
 * The pages rely on MSW 3 intercepting page navigations, so they are served
 * while a page of the app runs the worker: sign-in redirects and silent
 * sign-in iframes started by the app. Opening the authorize URL in a fresh
 * browser, or reloading the authorize page, reaches the server instead.
 */
export function createOidcHandlers<TClaims extends MockOidcClaimsSchema>(
  options: CreateOidcHandlersOptions<TClaims>,
): HttpHandler[] {
  return [
    ...createOidcPageHandlers(options),
    ...createOidcApiHandlers(options),
  ];
}
