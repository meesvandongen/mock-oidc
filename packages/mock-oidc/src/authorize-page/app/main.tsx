import { createRoot } from 'react-dom/client';
import {
  type MockOidcPageData,
  mockOidcPageDataElementId,
} from '../page-data.js';
import { AuthorizePage } from './authorize-page.js';
import { endSession } from './end-session.js';
import styles from './styles.css?inline';

const dataElement = document.getElementById(mockOidcPageDataElementId);
if (!dataElement?.textContent) {
  throw new Error('The mock OIDC page data was not found.');
}

const data = JSON.parse(dataElement.textContent) as MockOidcPageData;

if (data.page === 'end-session') {
  endSession(data);
} else {
  const style = document.createElement('style');
  style.textContent = styles;
  document.head.append(style);

  const container = document.createElement('div');
  container.id = 'mock-oidc-root';
  document.body.append(container);
  createRoot(container).render(<AuthorizePage data={data} />);
}
