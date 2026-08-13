import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './redux/store';
import App from './App';
import { getAppBasePath } from './lib/app-paths';

import '@patternfly/patternfly/patternfly.css';
import '@patternfly/patternfly/patternfly-addons.css';

import './global.css';

// Parse server-injected data from data attributes (CSP-safe, no inline scripts)
const rootEl = document.getElementById('root')!;
try {
  const userData = rootEl.dataset.user;
  const appData = rootEl.dataset.app;
  (window as any).USER_DATA = userData ? JSON.parse(decodeURIComponent(userData)) : {};
  (window as any).APP_DATA = appData ? JSON.parse(decodeURIComponent(appData)) : {};
} catch (e) {
  console.error('Failed to parse injected data:', e);
  (window as any).USER_DATA = {};
  (window as any).APP_DATA = {};
}

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter basename={getAppBasePath()}>
      <Provider store={store}>
        <App />
      </Provider>
    </BrowserRouter>
  </StrictMode>
);
