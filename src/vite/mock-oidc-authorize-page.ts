import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import {
  type MockOidcConfig,
  type MockOidcConfigInput,
  mockOidcConfigSchema,
  normalizeMockOidcAuthorizationPath,
} from '../config.js';
import {
  mockOidcClaimsStorageKey,
  mockOidcSubjectStorageKey,
} from '../oidc-session.js';
import type { Plugin } from 'vite';

export type MockOidcAuthorizePageOptions = {
  enabled: boolean;
  outputDirectory: string;
  config: MockOidcConfigInput;
};

const authorizePageTemplate = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Mock OIDC login</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f8fafc;
        color: #0f172a;
      }

      main {
        width: min(100%, 36rem);
        padding: 2rem;
        text-align: center;
      }

      h1 {
        margin: 0 0 0.75rem;
        font-size: 1.25rem;
      }

      p {
        margin: 0;
        line-height: 1.5;
      }

      label {
        display: block;
        margin-top: 1.5rem;
        text-align: left;
        font-weight: 600;
      }

      select,
      button {
        width: 100%;
        margin-top: 0.5rem;
        padding: 0.75rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.375rem;
        font: inherit;
      }

      select {
        background: white;
      }

      #mock-oidc-claim-selectors {
        display: grid;
        gap: 0.75rem;
      }

      .mock-oidc-claim-selector {
        margin: 1.5rem 0 0;
        padding: 0.75rem;
        border: 1px solid #cbd5e1;
        border-radius: 0.375rem;
        text-align: left;
      }

      .mock-oidc-claim-selector legend {
        padding: 0 0.25rem;
        font-size: 0.875rem;
      }

      .mock-oidc-claim-options {
        display: grid;
        gap: 0.5rem;
        max-height: 14rem;
        overflow-y: auto;
      }

      .mock-oidc-claim-option {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin: 0;
        font-size: 0.875rem;
        font-weight: 400;
      }

      .mock-oidc-claim-option input {
        width: auto;
        margin: 0;
      }

      button {
        border-color: #1d4ed8;
        background: #1d4ed8;
        color: white;
        cursor: pointer;
      }

      button:hover {
        background: #1e40af;
      }

      #mock-oidc-error {
        margin-top: 1rem;
        color: #dc2626;
        font-size: 0.875rem;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Mock OIDC login</h1>
      <p>Select a user and claims to continue.</p>
      <label for="mock-oidc-user">User</label>
      <select id="mock-oidc-user"></select>
      <div id="mock-oidc-claim-selectors"></div>
      <button id="mock-oidc-login" type="button">Log in</button>
      <p id="mock-oidc-error" hidden></p>
    </main>
    <script>
      const mockOidcConfig = __MOCK_OIDC_CONFIG__;
      const subjectStorageKey = __MOCK_OIDC_SUBJECT_STORAGE_KEY__;
      const claimsStorageKey = __MOCK_OIDC_CLAIMS_STORAGE_KEY__;
      const errorElement = document.getElementById('mock-oidc-error');
      const userSelect = document.getElementById('mock-oidc-user');
      const claimSelectorsElement = document.getElementById(
      'mock-oidc-claim-selectors',
      );
      const loginButton = document.getElementById('mock-oidc-login');

      function showError(message) {
        if (!errorElement) {
          throw new Error(message);
        }

        errorElement.hidden = false;
        errorElement.textContent = message;
      }

      function createAuthResponseUrl() {
        const url = new URL(window.location.href);
        const redirectUri = url.searchParams.get('redirect_uri');
        const state = url.searchParams.get('state');
        const responseMode = url.searchParams.get('response_mode') ?? 'query';

        if (!redirectUri) {
          showError('Missing redirect_uri query parameter.');
          return null;
        }

        if (!state) {
          showError('Missing state query parameter.');
          return null;
        }

        let redirectUrl;
        try {
          redirectUrl = new URL(redirectUri);
        } catch {
          showError('Invalid redirect_uri query parameter.');
          return null;
        }

        const allowedRedirectOrigins = [
          window.location.origin,
          ...mockOidcConfig.allowedRedirectOrigins.map(
            (origin) => new URL(origin).origin,
          ),
        ];
        if (!allowedRedirectOrigins.includes(redirectUrl.origin)) {
          showError('The mock OIDC redirect origin is not allowed.');
          return null;
        }

        const params =
          responseMode === 'fragment'
            ? new URLSearchParams(redirectUrl.hash.slice(1))
            : redirectUrl.searchParams;
        params.set('code', 'mock-authorization-code');
        params.set('state', state);

        if (responseMode === 'fragment') {
          redirectUrl.hash = params.toString();
        }

        return redirectUrl.toString();
      }

      function redirectToMockApplication(subject) {
        if (!subject) {
          showError('Select a mock user to continue.');
          return;
        }

        const authResponseUrl = createAuthResponseUrl();
        if (authResponseUrl) {
          window.sessionStorage.setItem(subjectStorageKey, subject);
          const selectedClaims = readSelectedClaims();
          if (Object.keys(selectedClaims).length === 0) {
            window.sessionStorage.removeItem(claimsStorageKey);
          } else {
            window.sessionStorage.setItem(
              claimsStorageKey,
              JSON.stringify(selectedClaims),
            );
          }

          window.location.replace(authResponseUrl);
        }
      }

      if (!(userSelect instanceof HTMLSelectElement)) {
        throw new Error('The mock OIDC user selector was not found.');
      }

      if (!(claimSelectorsElement instanceof HTMLDivElement)) {
        throw new Error('The mock OIDC claim selectors were not found.');
      }

      if (!(loginButton instanceof HTMLButtonElement)) {
        throw new Error('The mock OIDC login button was not found.');
      }

      function getUserPreset(subject) {
        return mockOidcConfig.users.find(
          (userPreset) => userPreset.subject === subject,
        );
      }

      function getStoredClaims() {
        const storedClaims = window.sessionStorage.getItem(claimsStorageKey);
        if (storedClaims === null) {
          return undefined;
        }

        const parsedClaims = JSON.parse(storedClaims);
        if (
          typeof parsedClaims !== 'object' ||
          parsedClaims === null ||
          Array.isArray(parsedClaims)
        ) {
          throw new Error(
            'Mock OIDC claim selection in session storage must be an object.',
          );
        }

        for (const [claim, values] of Object.entries(parsedClaims)) {
          if (
            !Array.isArray(values) ||
            !values.every(
              (value) => typeof value === 'string' && value.length > 0,
            ) ||
            new Set(values).size !== values.length
          ) {
            throw new Error(
              'Mock OIDC claim selection for "' +
                claim +
                '" must be an array of unique non-empty strings.',
            );
          }
        }

        return parsedClaims;
      }

      function renderClaimSelectors(subject, useStoredClaims) {
        const user = getUserPreset(subject);
        const savedClaims = useStoredClaims ? getStoredClaims() : undefined;

        claimSelectorsElement.replaceChildren();
        claimSelectorsElement.hidden =
          mockOidcConfig.claimSelectors.length === 0;

        for (const selector of mockOidcConfig.claimSelectors) {
          const fieldset = document.createElement('fieldset');
          fieldset.className = 'mock-oidc-claim-selector';
          fieldset.dataset.claim = selector.claim;

          const legend = document.createElement('legend');
          legend.textContent = selector.label;
          fieldset.append(legend);

          const optionsElement = document.createElement('div');
          optionsElement.className = 'mock-oidc-claim-options';

          const defaultValues = user?.claims[selector.claim] ?? [];
          const selectedValues =
            savedClaims?.[selector.claim] ?? defaultValues;
          const unavailableValues = selectedValues.filter(
            (value) => !selector.options.includes(value),
          );
          if (unavailableValues.length > 0) {
            showError(
              'Some saved values for "' +
                selector.claim +
                '" are no longer available. Review the selection before continuing.',
            );
          }
          const selectedValuesSet = new Set(
            selectedValues.filter((value) =>
              selector.options.includes(value),
            ),
          );

          for (const value of selector.options) {
            const label = document.createElement('label');
            label.className = 'mock-oidc-claim-option';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = 'mock-oidc-claim-' + selector.claim;
            checkbox.value = value;
            checkbox.checked = selectedValuesSet.has(value);

            const optionLabel = document.createElement('span');
            optionLabel.textContent = value;

            label.append(checkbox, optionLabel);
            optionsElement.append(label);
          }

          fieldset.append(optionsElement);
          claimSelectorsElement.append(fieldset);
        }
      }

      function readSelectedClaims() {
        return Object.fromEntries(
          mockOidcConfig.claimSelectors.map((selector) => {
            const fieldset = Array.from(claimSelectorsElement.children).find(
              (child) => child.dataset.claim === selector.claim,
            );
            if (!(fieldset instanceof HTMLFieldSetElement)) {
              throw new Error(
                'The mock OIDC selector for claim "' +
                  selector.claim +
                  '" was not found.',
              );
            }

            return [
              selector.claim,
              Array.from(
                fieldset.querySelectorAll('input:checked'),
                (checkbox) => checkbox.value,
              ),
            ];
          }),
        );
      }

      for (const userPreset of mockOidcConfig.users) {
        const option = document.createElement('option');
        option.value = userPreset.subject;
        option.textContent = userPreset.label;
        userSelect.append(option);
      }

      const storedSubject = window.sessionStorage.getItem(subjectStorageKey);
      if (
        storedSubject &&
        !mockOidcConfig.users.some(
          (userPreset) => userPreset.subject === storedSubject,
        )
      ) {
        const customOption = document.createElement('option');
        customOption.value = storedSubject;
        customOption.textContent = 'Custom user';
        userSelect.append(customOption);
      }

      userSelect.value = storedSubject ?? mockOidcConfig.defaultSubject;
      renderClaimSelectors(userSelect.value, storedSubject === userSelect.value);

      userSelect.addEventListener('change', () => {
        renderClaimSelectors(userSelect.value, false);
        errorElement.hidden = true;
      });

      loginButton.addEventListener('click', () => {
        redirectToMockApplication(userSelect.value);
      });

    </script>
  </body>
</html>
`;

function serializeInlineScriptValue(value: unknown) {
  const serializedValue = JSON.stringify(value);
  if (serializedValue === undefined) {
    throw new Error(
      'Mock OIDC authorize page configuration is not serializable',
    );
  }

  return serializedValue.replace(/</g, '\\u003c');
}

function renderAuthorizePage(config: MockOidcConfig) {
  return authorizePageTemplate
    .replace('__MOCK_OIDC_CONFIG__', serializeInlineScriptValue(config))
    .replace(
      '__MOCK_OIDC_SUBJECT_STORAGE_KEY__',
      serializeInlineScriptValue(mockOidcSubjectStorageKey),
    )
    .replace(
      '__MOCK_OIDC_CLAIMS_STORAGE_KEY__',
      serializeInlineScriptValue(mockOidcClaimsStorageKey),
    );
}

export function mockOidcAuthorizePage(
  options: MockOidcAuthorizePageOptions,
): Plugin | undefined {
  if (!options.enabled) {
    return undefined;
  }

  const config = mockOidcConfigSchema.parse(options.config);
  const authorizationPath = normalizeMockOidcAuthorizationPath(
    config.authorizationEndpointPath,
  );
  const authorizePageHtml = renderAuthorizePage(config);
  let projectRoot = process.cwd();
  let clientOutputDirectory: string | undefined;

  return {
    name: '@mvd/mock-oidc:authorize-page',
    configResolved(config) {
      projectRoot = config.root;
      clientOutputDirectory = resolve(projectRoot, options.outputDirectory);
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestPath = (request.url ?? '/').split('?', 1)[0];
        if (
          requestPath !== authorizationPath ||
          (request.method !== 'GET' && request.method !== 'HEAD')
        ) {
          return next();
        }

        response.statusCode = 200;
        response.setHeader('Content-Type', 'text/html; charset=utf-8');

        if (request.method === 'HEAD') {
          response.end();
          return;
        }

        response.end(authorizePageHtml);
      });
    },
    writeBundle(outputOptions) {
      if (!outputOptions.dir || !clientOutputDirectory) {
        return;
      }

      const outputDirectory = resolve(projectRoot, outputOptions.dir);
      if (outputDirectory !== clientOutputDirectory) {
        return;
      }

      const outputPath = resolve(
        clientOutputDirectory,
        authorizationPath.slice(1),
      );
      const relativeOutputPath = relative(clientOutputDirectory, outputPath);

      if (
        relativeOutputPath === '..' ||
        relativeOutputPath.startsWith(`..${sep}`)
      ) {
        throw new Error(
          `Mock OIDC authorization path escapes the client output directory: ${authorizationPath}`,
        );
      }

      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, authorizePageHtml, 'utf8');
    },
  };
}
