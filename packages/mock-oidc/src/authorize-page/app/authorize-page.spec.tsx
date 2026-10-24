import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { page, userEvent } from 'vite-plus/test/browser';
import { z } from 'zod';
import { decodeMockOidcAuthorizationCode } from '../../authorization.js';
import { defineMockOidcConfig, type MockOidcConfig } from '../../config.js';
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

function createPageData(pageConfig: MockOidcConfig): MockOidcPageData {
  return {
    page: 'authorize',
    defaultSubject: pageConfig.defaultSubject,
    allowedRedirectOrigins: [],
    users: pageConfig.users,
    formSchema: createMockOidcFormSchema(pageConfig.claims),
    storageKeys: {
      subject: mockOidcSubjectStorageKey,
      claims: mockOidcClaimsStorageKey,
    },
  };
}

const data = createPageData(config);

const originalUrl = window.location.href;
let root: Root | undefined;

function renderPage(params: Record<string, string>, pageData = data) {
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
  root.render(<AuthorizePage data={pageData} navigate={navigate} />);

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

describe('AuthorizePage with nested claims', () => {
  const nestedConfig = defineMockOidcConfig({
    defaultSubject: 'carol',
    claims: z.object({
      organization: z
        .object({
          name: z.string().min(1).meta({ title: 'Organization name' }),
          address: z
            .object({
              city: z.string().min(1).meta({ title: 'City' }),
              country: z.enum(['NL', 'BE']).meta({ title: 'Country' }),
            })
            .meta({ title: 'Address' }),
        })
        .meta({ title: 'Organization' }),
      memberships: z
        .array(
          z.object({
            team: z.string().min(1).meta({ title: 'Team' }),
            manager: z.string().optional().meta({ title: 'Manager' }),
            roles: z
              .array(z.enum(['member', 'lead']))
              .min(1)
              .meta({ title: 'Team roles' }),
            projects: z
              .array(
                z.object({
                  key: z.string().min(1).meta({ title: 'Project key' }),
                  archived: z.boolean().default(false).meta({ title: 'Archived' }),
                }),
              )
              .default([])
              .meta({ title: 'Projects' }),
          }),
        )
        .meta({ title: 'Memberships', description: 'Teams of the user' }),
      group_paths: z
        .array(z.array(z.string().min(1)))
        .default([])
        .meta({ title: 'Group paths' }),
    }),
    users: [
      {
        subject: 'carol',
        label: 'Carol',
        claims: {
          organization: {
            name: 'Acme',
            address: { city: 'Utrecht', country: 'NL' },
          },
          memberships: [
            { team: 'support', manager: 'dave', roles: ['member'] },
            { team: 'platform', roles: ['lead'], projects: [{ key: 'API' }] },
          ],
          group_paths: [['acme', 'engineering']],
        },
      },
    ],
  });
  const nestedData = createPageData(nestedConfig);

  const memberships = page.getByRole('group', { name: 'Memberships', exact: true });
  const membership = (index: number) =>
    page.getByRole('group', { name: 'Memberships item', exact: true }).nth(index);
  const team = (index: number) =>
    membership(index).getByLabelText('Team', { exact: true });
  const role = (index: number, name: string) =>
    membership(index).getByRole('group', { name: 'Team roles' }).getByLabelText(name);
  const projects = (index: number) =>
    membership(index).getByRole('group', { name: 'Projects', exact: true });
  const project = (membershipIndex: number, index: number) =>
    membership(membershipIndex)
      .getByRole('group', { name: 'Projects item', exact: true })
      .nth(index);
  const groupPath = (index: number) =>
    page.getByRole('group', { name: 'Group paths item', exact: true }).nth(index);

  it('prefills nested objects and arrays of objects', async () => {
    renderPage({}, nestedData);

    const organization = page.getByRole('group', { name: 'Organization' });
    await expect
      .element(organization.getByLabelText('Organization name'))
      .toHaveValue('Acme');
    const address = organization.getByRole('group', { name: 'Address' });
    await expect.element(address.getByLabelText('City')).toHaveValue('Utrecht');
    await expect.element(address.getByLabelText('Country')).toHaveValue('NL');

    await expect.element(memberships.getByText('Teams of the user')).toBeVisible();
    await expect.element(team(0)).toHaveValue('support');
    await expect.element(membership(0).getByLabelText('Manager')).toHaveValue('dave');
    await expect.element(role(0, 'member')).toBeChecked();
    await expect.element(role(0, 'lead')).not.toBeChecked();
    expect(
      membership(0).getByRole('group', { name: 'Projects item', exact: true }).elements(),
    ).toHaveLength(0);

    await expect.element(team(1)).toHaveValue('platform');
    await expect.element(role(1, 'lead')).toBeChecked();
    await expect.element(project(1, 0).getByLabelText('Project key')).toHaveValue('API');
    await expect.element(project(1, 0).getByLabelText('Archived')).not.toBeChecked();

    const segments = groupPath(0).getByLabelText('Group paths item item');
    await expect.element(segments.nth(0)).toHaveValue('acme');
    await expect.element(segments.nth(1)).toHaveValue('engineering');
  });

  it('submits edits to arrays of objects at every level', async () => {
    const navigate = renderPage({}, nestedData);

    const address = page.getByRole('group', { name: 'Address' });
    await userEvent.fill(address.getByLabelText('City'), 'Antwerp');
    await userEvent.selectOptions(address.getByLabelText('Country'), 'BE');

    // Removing the first membership moves the second one up; it keeps its own
    // values instead of the removed membership's manager.
    await userEvent.click(memberships.getByRole('button', { name: 'Remove' }).first());
    await expect.element(team(0)).toHaveValue('platform');
    await expect.element(membership(0).getByLabelText('Manager')).toHaveValue('');

    // A field and a new item in an array nested in an array item.
    await userEvent.click(project(0, 0).getByLabelText('Archived'));
    await userEvent.click(projects(0).getByRole('button', { name: 'Add' }));
    await userEvent.fill(project(0, 1).getByLabelText('Project key'), 'WEB');

    // A new membership starts empty rather than with the values of the
    // preset's membership at the same index.
    await userEvent.click(memberships.getByRole('button', { name: 'Add' }).last());
    await expect.element(team(1)).toHaveValue('');
    await expect.element(role(1, 'lead')).not.toBeChecked();
    await userEvent.fill(team(1), 'security');
    await userEvent.click(role(1, 'member'));
    await userEvent.click(projects(1).getByRole('button', { name: 'Add' }));
    await userEvent.fill(project(1, 0).getByLabelText('Project key'), 'IAM');

    // An item of an array of arrays.
    await userEvent.click(groupPath(0).getByRole('button', { name: 'Add' }));
    await userEvent.fill(
      groupPath(0).getByLabelText('Group paths item item').nth(2),
      'identity',
    );

    await userEvent.click(page.getByRole('button', { name: 'Log in' }));

    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    expect(
      JSON.parse(window.sessionStorage.getItem(mockOidcClaimsStorageKey) ?? 'null'),
    ).toEqual({
      organization: {
        name: 'Acme',
        address: { city: 'Antwerp', country: 'BE' },
      },
      memberships: [
        {
          team: 'platform',
          roles: ['lead'],
          projects: [
            { key: 'API', archived: true },
            { key: 'WEB', archived: false },
          ],
        },
        {
          team: 'security',
          roles: ['member'],
          projects: [{ key: 'IAM', archived: false }],
        },
      ],
      group_paths: [['acme', 'engineering', 'identity']],
    });
  });

  it('shows errors next to invalid fields in array items', async () => {
    const navigate = renderPage({}, nestedData);

    await userEvent.fill(team(0), '');
    await userEvent.click(role(0, 'member'));
    await userEvent.fill(project(1, 0).getByLabelText('Project key'), '');
    await userEvent.click(page.getByRole('button', { name: 'Log in' }));

    await expect.element(project(1, 0).getByRole('alert')).toBeVisible();
    expect(membership(0).getByRole('alert').elements()).toHaveLength(2);
    expect(page.getByRole('alert').elements()).toHaveLength(3);
    expect(navigate).not.toHaveBeenCalled();
  });
});
