import { AutoForm } from '@autoform/react/react-hook-form';
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useFormContext } from 'react-hook-form';
import {
  createMockOidcAuthorizationCode,
  createMockOidcAuthorizationResponseUrl,
  type MockOidcAuthorizationRequest,
  parseMockOidcAuthorizationRequest,
} from '../../authorization.js';
import type { MockOidcPageData } from '../page-data.js';
import {
  formComponents,
  MockOidcSchemaProvider,
  uiComponents,
} from './autoform.js';

const customUserValue = '';

type FormValues = Record<string, unknown> & { sub: string };

/** Navigates back to the client; replaced in tests. */
export type Navigate = (url: string) => void;

const replaceLocation: Navigate = (url) => window.location.replace(url);

function parseRequest(data: MockOidcPageData) {
  try {
    return {
      request: parseMockOidcAuthorizationRequest(window.location.href, [
        window.location.origin,
        ...data.allowedRedirectOrigins,
      ]),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function readStoredClaims(data: MockOidcPageData) {
  try {
    const claims: unknown = JSON.parse(
      window.sessionStorage.getItem(data.storageKeys.claims) ?? 'null',
    );
    return typeof claims === 'object' && claims !== null && !Array.isArray(claims)
      ? (claims as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

function getUserValues(data: MockOidcPageData, subject: string): FormValues {
  const user = data.users.find((candidate) => candidate.subject === subject);
  return { ...user?.claims, sub: subject };
}

function getInitialSelection(data: MockOidcPageData) {
  const storedSubject = window.sessionStorage.getItem(data.storageKeys.subject);
  if (storedSubject === null) {
    return {
      preset: data.defaultSubject,
      values: getUserValues(data, data.defaultSubject),
    };
  }

  const isPreset = data.users.some((user) => user.subject === storedSubject);
  return {
    preset: isPreset ? storedSubject : customUserValue,
    values: {
      ...getUserValues(data, storedSubject),
      ...readStoredClaims(data),
      sub: storedSubject,
    },
  };
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mock-oidc">
      <h1>Mock OIDC login</h1>
      {children}
    </main>
  );
}

/**
 * Fills the form with the selected values while keeping the schema defaults
 * as the form's default values. React Hook Form gives fields without a value
 * the default value at the same path, so with the selection as defaults an
 * added array item, or one that moved up after a removal, would show the
 * values of the selection's item at that index.
 */
function SelectedValues({ values }: { values: FormValues }) {
  const { reset } = useFormContext<FormValues>();

  useLayoutEffect(() => {
    reset(values, { keepDefaultValues: true });
  }, [reset, values]);

  return null;
}

type PageProps = {
  data: MockOidcPageData;
  request: MockOidcAuthorizationRequest;
  navigate: Navigate;
};

function SilentAuthorization({ data, request, navigate }: PageProps) {
  useEffect(() => {
    const hasSession =
      window.sessionStorage.getItem(data.storageKeys.subject) !== null;
    navigate(
      createMockOidcAuthorizationResponseUrl(
        request,
        hasSession
          ? { code: createMockOidcAuthorizationCode(request) }
          : {
              error: 'login_required',
              errorDescription: 'The mock OIDC provider has no session',
            },
      ),
    );
  }, [data, request, navigate]);

  return <p>Redirecting…</p>;
}

function LoginForm({ data, request, navigate }: PageProps) {
  const schema = useMemo(
    () => new MockOidcSchemaProvider(data.formSchema),
    [data.formSchema],
  );
  const [selection, setSelection] = useState(() => getInitialSelection(data));
  const [formKey, setFormKey] = useState(0);

  function selectPreset(preset: string) {
    setSelection((current) => ({
      preset,
      values:
        preset === customUserValue
          ? { ...current.values, sub: '' }
          : getUserValues(data, preset),
    }));
    setFormKey((key) => key + 1);
  }

  function signIn({ sub, ...claims }: FormValues) {
    window.sessionStorage.setItem(data.storageKeys.subject, sub);
    window.sessionStorage.setItem(data.storageKeys.claims, JSON.stringify(claims));
    navigate(
      createMockOidcAuthorizationResponseUrl(request, {
        code: createMockOidcAuthorizationCode(request),
      }),
    );
  }

  return (
    <>
      <p className="mock-oidc-intro">Select a user and claims to continue.</p>
      <div className="mock-oidc-field">
        <label htmlFor="mock-oidc-user">User</label>
        <select
          id="mock-oidc-user"
          value={selection.preset}
          onChange={(event) => selectPreset(event.target.value)}
        >
          {data.users.map((user) => (
            <option key={user.subject} value={user.subject}>
              {user.label}
            </option>
          ))}
          <option value={customUserValue}>Custom user</option>
        </select>
      </div>
      <AutoForm<FormValues>
        key={formKey}
        schema={schema}
        onSubmit={signIn}
        uiComponents={uiComponents}
        formComponents={formComponents}
      >
        <SelectedValues values={selection.values} />
        <button type="submit" className="mock-oidc-submit">
          Log in
        </button>
      </AutoForm>
    </>
  );
}

export function AuthorizePage({
  data,
  navigate = replaceLocation,
}: {
  data: MockOidcPageData;
  navigate?: Navigate;
}) {
  const [parsed] = useState(() => parseRequest(data));

  if (!parsed.request) {
    return (
      <Shell>
        <p role="alert" className="mock-oidc-error">
          {parsed.error}
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      {parsed.request.prompt.includes('none') ? (
        <SilentAuthorization
          data={data}
          request={parsed.request}
          navigate={navigate}
        />
      ) : (
        <LoginForm data={data} request={parsed.request} navigate={navigate} />
      )}
    </Shell>
  );
}
