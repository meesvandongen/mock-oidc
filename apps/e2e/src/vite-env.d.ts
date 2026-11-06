/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOCK_OIDC_WORKER?: string;
  /** `msw` serves the authorize and end session pages from the MSW worker. */
  readonly VITE_MOCK_OIDC_PAGES?: string;
}
