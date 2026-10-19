/**
 * Starts the MSW service worker that mocks the provider during development
 * and in the static demo. The interactive authorize and logout pages are
 * served by the Vite plugin.
 *
 * The worker, the mock provider and its configuration are imported
 * dynamically, so production builds contain none of them.
 *
 * Playwright tests that use the adapter run without the worker and mock the
 * provider from the test process instead.
 */
export async function enableMocking() {
  if (import.meta.env.VITE_MOCK_OIDC_WORKER !== 'true') {
    return;
  }

  const { startMockOidcWorker } = await import('./mock-oidc-worker');
  await startMockOidcWorker();
}
