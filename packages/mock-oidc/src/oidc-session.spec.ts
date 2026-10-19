import { beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineMockOidcConfig } from './config.js';
import {
  clearMockOidcSessionInWindow,
  getMockOidcClaimsFromWindow,
  getMockOidcIdentityFromWindow,
  getMockOidcSubjectFromWindow,
  getStoredMockOidcSubject,
  mockOidcClaimsStorageKey,
  mockOidcSubjectStorageKey,
  setMockOidcClaimsInWindow,
  setMockOidcSubjectInWindow,
} from './oidc-session.js';

const mockOidcConfig = defineMockOidcConfig({
  defaultSubject: 'mock-subject',
  claims: z.object({
    permissions: z.array(z.enum(['app:read', 'app:write'])),
    teams: z.array(z.enum(['support'])),
  }),
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
});

describe('mock OIDC session', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('falls back to the default subject without starting a session', () => {
    expect(getMockOidcSubjectFromWindow(window, 'mock-subject')).toBe(
      'mock-subject',
    );
    expect(getStoredMockOidcSubject(window)).toBeUndefined();

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

  it('stores claim selections together', () => {
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

  it('resolves browser state with user defaults and stored claims', () => {
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

  it('validates stored claims with the claims schema', () => {
    window.sessionStorage.setItem(
      mockOidcClaimsStorageKey,
      '{"permissions":"app:read","teams":[]}',
    );

    expect(() => getMockOidcIdentityFromWindow(window, mockOidcConfig)).toThrow(
      'Invalid mock OIDC claims in session storage',
    );

    window.sessionStorage.setItem(mockOidcClaimsStorageKey, '["app:read"]');
    expect(() => getMockOidcClaimsFromWindow(window)).toThrow(
      'Mock OIDC claim selection must be an object',
    );
  });

  it('clears the mock session', () => {
    setMockOidcSubjectInWindow(window, 'mock-subject');
    setMockOidcClaimsInWindow(window, { permissions: [], teams: [] });

    clearMockOidcSessionInWindow(window);

    expect(getStoredMockOidcSubject(window)).toBeUndefined();
    expect(getMockOidcClaimsFromWindow(window)).toBeUndefined();
  });
});
