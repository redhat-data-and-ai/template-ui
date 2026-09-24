import '@testing-library/jest-dom';
import { expect } from 'vitest';
import { configureAxe, toHaveNoViolations } from 'jest-axe';

// Node 26+ defines localStorage/sessionStorage as getter-based experimental
// Web Storage on globalThis, but jsdom 29 does not override them.  Without
// --localstorage-file the Node getter returns undefined, so any test code (or
// production code running at module-load time) that calls localStorage.getItem
// etc. would throw.  Replace both with simple in-memory implementations that
// behave like a browser Storage object.
class InMemoryStorage implements Storage {
  private _store: Record<string, string> = {};

  get length(): number {
    return Object.keys(this._store).length;
  }

  key(index: number): string | null {
    return Object.keys(this._store)[index] ?? null;
  }

  getItem(key: string): string | null {
    return Object.prototype.hasOwnProperty.call(this._store, key)
      ? this._store[key]
      : null;
  }

  setItem(key: string, value: string): void {
    this._store[String(key)] = String(value);
  }

  removeItem(key: string): void {
    delete this._store[String(key)];
  }

  clear(): void {
    this._store = {};
  }
}

// Node 26+ exposes an experimental localStorage getter on globalThis, but
// it can throw when actually accessed (e.g. no --localstorage-file flag).
// A simple undefined/null check is insufficient — we must probe the API.
function isStorageBroken(getter: () => Storage | null | undefined): boolean {
  try {
    const s = getter();
    if (s == null) return true;
    s.getItem('__vitest_probe__'); // throws on broken Node 26+ experimental storage
    return false;
  } catch {
    return true;
  }
}

if (isStorageBroken(() => globalThis.localStorage)) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new InMemoryStorage(),
    writable: true,
    configurable: true,
  });
}
if (isStorageBroken(() => globalThis.sessionStorage)) {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: new InMemoryStorage(),
    writable: true,
    configurable: true,
  });
}
// Extend vitest expect with jest-axe matchers
expect.extend(toHaveNoViolations);

// Configure axe with WCAG 2.1 AA rules
// Disable color-contrast: jsdom cannot compute computed styles
export const axe = configureAxe({
  rules: {
    'color-contrast': { enabled: false },
  },
});

// Mock window.APP_DATA and window.USER_DATA for all tests
Object.defineProperty(window, 'APP_DATA', {
  value: {
    agentName: 'TestAgent',
    basePath: '/',
  },
  writable: true,
  configurable: true,
});

Object.defineProperty(window, 'USER_DATA', {
  value: {
    displayName: 'Test User',
    given_name: 'Test',
    email: 'test@example.com',
    preferred_username: 'test.user',
  },
  writable: true,
  configurable: true,
});
