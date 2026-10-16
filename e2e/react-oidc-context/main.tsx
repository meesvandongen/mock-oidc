import { createRoot } from 'react-dom/client';
import { AuthProvider, useAuth } from 'react-oidc-context';
import { issuerUrl, pageUrl } from '../src/app-urls';
import { enableMocking } from '../src/mocks';
import { Profile } from '../src/profile';

const appUrl = pageUrl('react-oidc-context/');

function App() {
  const auth = useAuth();

  return (
    <Profile
      library="react-oidc-context"
      loading={auth.isLoading}
      error={auth.error?.message}
      claims={auth.user?.profile}
      onSignIn={() => void auth.signinRedirect()}
      onSignOut={() => void auth.signoutRedirect()}
    />
  );
}

await enableMocking();

createRoot(document.getElementById('root')!).render(
  <AuthProvider
    authority={issuerUrl}
    client_id="react-oidc-context"
    redirect_uri={appUrl}
    post_logout_redirect_uri={appUrl}
    scope="openid profile email"
    onSigninCallback={() => {
      window.history.replaceState({}, document.title, window.location.pathname);
    }}
  >
    <App />
  </AuthProvider>,
);
