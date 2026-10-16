import { createRoot } from 'react-dom/client';
import { enableMocking } from '../src/mocks';
import { Profile } from '../src/profile';
import { bootstrapOidc, OidcInitializationGate, useOidc } from './oidc';

function App() {
  const oidc = useOidc();

  return (
    <Profile
      library="oidc-spa"
      error={oidc.isUserLoggedIn ? undefined : oidc.initializationError?.message}
      claims={oidc.isUserLoggedIn ? oidc.decodedIdToken : undefined}
      onSignIn={() => {
        if (!oidc.isUserLoggedIn) {
          void oidc.login();
        }
      }}
      onSignOut={() => {
        if (oidc.isUserLoggedIn) {
          void oidc.logout({ redirectTo: 'home' });
        }
      }}
    />
  );
}

await enableMocking();

bootstrapOidc({
  implementation: 'real',
  issuerUri: window.location.origin,
  clientId: 'oidc-spa',
  scopes: ['openid', 'profile', 'email'],
});

createRoot(document.getElementById('root')!).render(
  <OidcInitializationGate fallback={<p data-testid="status">loading</p>}>
    <App />
  </OidcInitializationGate>,
);
