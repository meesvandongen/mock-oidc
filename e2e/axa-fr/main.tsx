import {
  type OidcConfiguration,
  OidcProvider,
  useOidc,
  useOidcIdToken,
} from '@axa-fr/react-oidc';
import { createRoot } from 'react-dom/client';
import { enableMocking } from '../src/mocks';
import { Profile } from '../src/profile';

const appPath = '/axa-fr/';

// No service_worker_relative_url: the library's own service worker would
// replace the MSW worker registered at the same scope.
const configuration: OidcConfiguration = {
  authority: window.location.origin,
  client_id: 'axa-fr',
  // Must differ from the page path; it is served by axa-fr/callback/index.html.
  redirect_uri: `${window.location.origin}${appPath}callback/`,
  scope: 'openid profile email',
};

function App() {
  const { login, logout, isAuthenticated } = useOidc();
  const { idTokenPayload } = useOidcIdToken();

  return (
    <Profile
      library="@axa-fr/react-oidc"
      claims={isAuthenticated ? idTokenPayload : undefined}
      onSignIn={() => void login(appPath)}
      onSignOut={() => void logout(appPath)}
    />
  );
}

await enableMocking();

createRoot(document.getElementById('root')!).render(
  <OidcProvider configuration={configuration}>
    <App />
  </OidcProvider>,
);
