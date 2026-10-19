import { AuthProvider, useAuth } from 'oidc-react';
import { createRoot } from 'react-dom/client';
import { issuerUrl, pageUrl } from '../src/app-urls';
import { enableMocking } from '../src/mocks';
import { Profile } from '../src/profile';

const appUrl = pageUrl('oidc-react/');

function App() {
  const auth = useAuth();

  return (
    <Profile
      library="oidc-react"
      loading={auth.isLoading}
      claims={auth.userData?.profile}
      onSignIn={() => void auth.signIn()}
      onSignOut={() => void auth.signOutRedirect()}
    />
  );
}

await enableMocking();

createRoot(document.getElementById('root')!).render(
  <AuthProvider
    authority={issuerUrl}
    clientId="oidc-react"
    redirectUri={appUrl}
    postLogoutRedirectUri={appUrl}
    scope="openid profile email"
    autoSignIn={false}
    onSignIn={() => {
      window.history.replaceState({}, document.title, window.location.pathname);
    }}
  >
    <App />
  </AuthProvider>,
);
