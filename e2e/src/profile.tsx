import type { ReactNode } from 'react';

export type ProfileProps = {
  library: string;
  loading?: boolean;
  error?: string;
  claims?: Record<string, unknown>;
  onSignIn: () => void;
  onSignOut: () => void;
};

/** Library-independent rendering of the authentication state for tests. */
export function Profile({
  library,
  loading,
  error,
  claims,
  onSignIn,
  onSignOut,
}: ProfileProps) {
  let content: ReactNode;
  if (loading) {
    content = <p data-testid="status">loading</p>;
  } else if (claims) {
    content = (
      <>
        <p data-testid="status">authenticated</p>
        <p>
          Signed in as <strong data-testid="subject">{String(claims.sub)}</strong>
        </p>
        <pre data-testid="claims">{JSON.stringify(claims, null, 2)}</pre>
        <button type="button" onClick={onSignOut}>
          Sign out
        </button>
      </>
    );
  } else {
    content = (
      <>
        <p data-testid="status">anonymous</p>
        <button type="button" onClick={onSignIn}>
          Sign in
        </button>
      </>
    );
  }

  return (
    <main>
      <h1>{library}</h1>
      {error ? <p role="alert">{error}</p> : null}
      {content}
    </main>
  );
}
