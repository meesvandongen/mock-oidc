import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { z } from 'zod';
import { decodeMockOidcAuthorizationCode } from '../../authorization.js';
import { defineMockOidcConfig } from '../../config.js';
import {
  mockOidcClaimsStorageKey,
  mockOidcSubjectStorageKey,
} from '../../oidc-session.js';
import { createMockOidcFormSchema } from '../form-schema.js';
import type { MockOidcPageData } from '../page-data.js';
import { AuthorizePage } from './authorize-page.js';

const config = defineMockOidcConfig({
  defaultSubject: 'alice',
  claims: z.object({
    name: z.string().min(1).meta({ title: 'Name' }),
    age: z.int().min(0).optional().meta({ title: 'Age' }),
    admin: z.boolean().default(false).meta({ title: 'Administrator' }),
    roles: z.array(z.enum(['reader', 'writer'])).meta({ title: 'Roles' }),
    address: z
      .object({ city: z.string().meta({ title: 'City' }) })
      .meta({ title: 'Address' }),
    nicknames: z.array(z.string()).default([]).meta({ title: 'Nicknames' }),
  }),
  users: [
    {
      subject: 'alice',
      label: 'Alice',
      claims: {
        name: 'Alice',
        roles: ['reader'],
        address: { city: 'Utrecht' },
      },
    },
    {
      subject: 'bob',
      label: 'Bob',
      claims: { name: 'Bob', roles: ['writer'], address: { city: 'Delft' } },
    },
  ],
});

const data: MockOidcPageData = {
  page: 'authorize',
  defaultSubject: config.defaultSubject,
  allowedRedirectOrigins: [],
  users: config.users,
  formSchema: createMockOidcFormSchema(config.claims),
  storageKeys: {
    subject: mockOidcSubjectStorageKey,
    claims: mockOidcClaimsStorageKey,
  },
};

const originalUrl = window.location.href;
let root: Root | undefined;

function renderPage(params: Record<string, string>) {
  const url = new URL(originalUrl);
  url.search = new URLSearchParams({
    redirect_uri: `${window.location.origin}/callback`,
    state: 'test-state',
    nonce: 'test-nonce',
    ...params,
  }).toString();
  window.history.replaceState(null, '', url);

  const navigate = vi.fn<(url: string) => void>();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  root.render(<AuthorizePage data={data} navigate={navigate} />);

  return navigate;
}

function redirectedTo(navigate: ReturnType<typeof renderPage>) {
  const [[location]] = navigate.mock.calls as [[string]];
  return new URL(location);
}

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  root?.unmount();
  document.body.replaceChildren();
  window.history.replaceState(null, '', originalUrl);
});

describe('AuthorizePage', () => {
  it('renders every field type from the claims schema', async () => {
    renderPage({});

    await expect.element(page.getByLabelText('Subject')).toHaveValue('alice');
    await expect.element(page.getByLabelText('Name')).toHaveValue('Alice');
    await expect.element(page.getByLabelText('Age (optional)')).toHaveValue(null);
    await expect.element(page.getByLabelText('Administrator')).not.toBeChecked();
    await expect
      .element(page.getByRole('group', { name: 'Roles' }).getByLabelText('reader'))
      .toBeChecked();
    await expect.element(page.getByLabelText('City')).toHaveValue('Utrecht');
    await expect.element(page.getByRole('group', { name: 'Nicknames' })).toBeVisible();
  });

  it('submits the edited identity and redirects with a code', async () => {
    const navigate = renderPage({ code_challenge: 'challenge', code_challenge_method: 'S256' });

    await userEvent.selectOptions(page.getByLabelText('User'), 'bob');
    await expect.element(page.getByLabelText('Name')).toHaveValue('Bob');
    await userEvent.fill(page.getByLabelText('Age (optional)'), '42');
    await userEvent.click(page.getByLabelText('Administrator'));
    await userEvent.click(page.getByRole('group', { name: 'Roles' }).getByLabelText('reader'));
    await userEvent.fill(page.getByLabelText('City'), 'Leiden');
    await userEvent.click(page.getByRole('button', { name: 'Add' }));
    await userEvent.fill(page.getByLabelText('Nicknames item'), 'bobby');
    await userEvent.click(page.getByRole('button', { name: 'Log in' }));

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    const location = redirectedTo(navigate);
    expect(location.pathname).toBe('/callback');
    expect(location.searchParams.get('state')).toBe('test-state');
    expect(
      decodeMockOidcAuthorizationCode(location.searchParams.get('code') ?? ''),
    ).toEqual({
      nonce: 'test-nonce',
      codeChallenge: 'challenge',
      codeChallengeMethod: 'S256',
    });
    expect(window.sessionStorage.getItem(mockOidcSubjectStorageKey)).toBe('bob');
    expect(
      JSON.parse(window.sessionStorage.getItem(mockOidcClaimsStorageKey) ?? 'null'),
    ).toEqual({
      name: 'Bob',
      age: 42,
      admin: true,
      roles: ['reader', 'writer'],
      address: { city: 'Leiden' },
      nicknames: ['bobby'],
    });
  });

  it('blocks submission while the claims are invalid', async () => {
    const navigate = renderPage({});

    await userEvent.fill(page.getByLabelText('Name'), '');
    await userEvent.fill(page.getByLabelText('Age (optional)'), '-1');
    await userEvent.click(page.getByRole('button', { name: 'Log in' }));

    await expect.element(page.getByRole('alert').first()).toBeVisible();
    expect(page.getByRole('alert').elements()).toHaveLength(2);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('answers prompt=none without rendering the form', async () => {
    const navigate = renderPage({ prompt: 'none', response_mode: 'fragment' });

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    expect(new URLSearchParams(redirectedTo(navigate).hash.slice(1)).get('error')).toBe(
      'login_required',
    );
    expect(page.getByLabelText('Subject').elements()).toHaveLength(0);
  });

  it('shows an error for invalid authorization requests', async () => {
    renderPage({ response_type: 'token' });

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent('Unsupported mock OIDC response_type: token');
  });
});
