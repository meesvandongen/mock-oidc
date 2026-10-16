import { oidcSpa } from 'oidc-spa/react-spa';

type DecodedIdToken = { sub: string; [claim: string]: unknown };

export const { bootstrapOidc, useOidc, OidcInitializationGate } = oidcSpa
  .withExpectedDecodedIdTokenShape({
    decodedIdTokenSchema: { parse: (token): DecodedIdToken => token as DecodedIdToken },
  })
  .createUtils();
