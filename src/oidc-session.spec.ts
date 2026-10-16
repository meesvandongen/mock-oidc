import { beforeEach, describe, expect, it } from 'vitest';
import type { MockOidcConfigInput } from './config.js';
import {
  getMockOidcClaimsFromWindow,
  getMockOidcIdentityFromWindow,
  getMockOidcSubjectFromWindow,
  mockOidcClaimsStorageKey,
  mockOidcSubjectStorageKey,
  setMockOidcClaimsInWindow,
  setMockOidcSubjectInWindow,
} from './oidc-session.js';

const mockOidcConfig: MockOidcConfigInput = {
  defaultSubject: 'mock-subject',
  claimSelectors: [
    {
      claim: 'permissions',
      label: 'Permissions',
      options: ['app:read', 'app:write'],
    },
    {
      claim: 'teams',
      label: 'Teams',
      options: ['support'],
    },
  ],
  users: [
    {
      subject: 'mock-subject',
      label: 'Mock user',
      claims: {
        permissions: ['app:read'],
        teams: ['support'],
      },
    },
  ],
};

describe('mock OIDC session', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('reads and persists the configured default subject', () => {
    expect(getMockOidcSubjectFromWindow(window, 'mock-subject')).toBe(
      'mock-subject',
    );
    window.sessionStorage.setItem(mockOidcSubjectStorageKey, 'other-subject');
    expect(getMockOidcSubjectFromWindow(window, 'mock-subject')).toBe(
      'other-subject',
    );
  });

  it('sets the selected subject for mock OIDC handlers', () => {
    setMockOidcSubjectInWindow(window, 'other-subject');

    expect(window.sessionStorage.getItem(mockOidcSubjectStorageKey)).toBe(
      'other-subject',
    );
  });

  it('stores arbitrary claim selections together', () => {
    const claims = {
      permissions: ['app:read', 'app:write'],
      teams: ['support'],
    };
    setMockOidcClaimsInWindow(window, claims);

    expect(window.sessionStorage.getItem(mockOidcClaimsStorageKey)).toBe(
      JSON.stringify(claims),
    );
    expect(getMockOidcClaimsFromWindow(window)).toEqual(claims);
  });

  it('returns no stored claims before a selection has been made', () => {
    expect(getMockOidcClaimsFromWindow(window)).toBeUndefined();
  });

  it('resolves browser state with user defaults and stored overrides', () => {
    expect(getMockOidcIdentityFromWindow(window, mockOidcConfig)).toEqual({
      subject: 'mock-subject',
      claims: {
        permissions: ['app:read'],
        teams: ['support'],
      },
    });

    setMockOidcClaimsInWindow(window, {
      permissions: ['app:write'],
      teams: [],
    });

    expect(getMockOidcIdentityFromWindow(window, mockOidcConfig)).toEqual({
      subject: 'mock-subject',
      claims: {
        permissions: ['app:write'],
        teams: [],
      },
    });
  });

  it('rejects malformed stored claim selections', () => {
    window.sessionStorage.setItem(
      mockOidcClaimsStorageKey,
      '{"permissions":"app:read"}',
    );

    expect(() => getMockOidcClaimsFromWindow(window)).toThrow(
      'Mock OIDC claim selection "permissions" must be an array of unique non-empty strings',
    );
  });
});
