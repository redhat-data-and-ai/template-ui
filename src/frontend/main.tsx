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

type InjectedRecord = Record<string, unknown>;

function parseInjected(rootEl: HTMLElement): { user: InjectedRecord; app: InjectedRecord } {
  try {
    const userData = rootEl.dataset.user;
    const appData = rootEl.dataset.app;
    return {
      user: userData ? JSON.parse(decodeURIComponent(userData)) : {},
      app: appData ? JSON.parse(decodeURIComponent(appData)) : {},
    };
  } catch (e) {
    console.error('Failed to parse injected data:', e);
    return { user: {}, app: {} };
  }
}

function isSparseUser(user: InjectedRecord): boolean {
  return !user.preferred_username && !user.name && !user.email && !user.displayName && !user.sub;
}

async function loadSessionUser(injected: InjectedRecord): Promise<InjectedRecord | 'login'> {
  if (!isSparseUser(injected)) return injected;
  try {
    const res = await fetch('/api/me', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      redirect: 'manual',
    });
    if (res.status === 401) return 'login';
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) return injected;
    const body = await res.json();
    return body && typeof body === 'object' ? (body as InjectedRecord) : injected;
  } catch {
    return injected;
  }
}

async function boot() {
  const rootEl = document.getElementById('root')!;
  const injected = parseInjected(rootEl);
  (window as any).APP_DATA = injected.app;
  const sessionUser = await loadSessionUser(injected.user);
  if (sessionUser === 'login') {
    window.location.replace('/login');
    return;
  }
  (window as any).USER_DATA = sessionUser;

  createRoot(rootEl).render(
    <StrictMode>
      <BrowserRouter basename={getAppBasePath()}>
        <Provider store={store}>
          <App />
        </Provider>
      </BrowserRouter>
    </StrictMode>
  );
}

void boot();

