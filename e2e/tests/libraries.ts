import { expect, type Page } from '@playwright/test';

/**
 * Example pages, one per OIDC client library, relative to the project's
 * `baseURL` so they also work when the app is served under a sub-path.
 */
export const libraries = [
  { name: 'react-oidc-context', path: 'react-oidc-context/' },
  { name: 'oidc-react', path: 'oidc-react/' },
  { name: 'oidc-spa', path: 'oidc-spa/' },
  { name: '@axa-fr/react-oidc', path: 'axa-fr/' },
] as const;

export type Library = (typeof libraries)[number];

export async function readClaims(page: Page) {
  await expect(page.getByTestId('status')).toHaveText('authenticated');
  return JSON.parse(
    (await page.getByTestId('claims').textContent()) ?? '{}',
  ) as Record<string, unknown>;
}

export async function expectAnonymous(page: Page) {
  await expect(page.getByTestId('status')).toHaveText('anonymous');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
}
