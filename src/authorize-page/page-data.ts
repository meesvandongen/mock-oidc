/**
 * Data the Vite plugin embeds into the mock OIDC pages. It must stay JSON
 * serializable; the claims schema travels as JSON Schema and is turned back
 * into a zod schema in the browser.
 */
export type MockOidcPageData = {
  page: 'authorize' | 'end-session';
  defaultSubject: string;
  allowedRedirectOrigins: string[];
  users: {
    subject: string;
    label: string;
    claims: Record<string, unknown>;
  }[];
  /** JSON Schema of the form: `sub` followed by the configured claims. */
  formSchema: Record<string, unknown>;
  storageKeys: {
    subject: string;
    claims: string;
  };
};

export const mockOidcPageDataElementId = 'mock-oidc-page-data';
