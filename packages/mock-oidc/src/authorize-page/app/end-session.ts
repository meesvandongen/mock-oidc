import { createMockOidcEndSessionResponseUrl } from '../../authorization.js';
import type { MockOidcPageData } from '../page-data.js';

export function endSession(data: MockOidcPageData) {
  window.sessionStorage.removeItem(data.storageKeys.subject);
  window.sessionStorage.removeItem(data.storageKeys.claims);

  let redirectUrl: string | undefined;
  try {
    redirectUrl = createMockOidcEndSessionResponseUrl(window.location.href, [
      window.location.origin,
      ...data.allowedRedirectOrigins,
    ]);
  } catch (error) {
    document.body.textContent =
      error instanceof Error ? error.message : String(error);
    return;
  }

  if (redirectUrl === undefined) {
    document.body.textContent = 'You have been signed out of the mock OIDC provider.';
    return;
  }

  window.location.replace(redirectUrl);
}
