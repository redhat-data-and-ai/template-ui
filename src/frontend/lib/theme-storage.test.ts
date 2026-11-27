import { describe, it, expect, beforeEach } from 'vitest';
import { persistThemeChoice, resolveInitialTheme, themeStorageKey } from './theme-storage';

const store = (data: Record<string, string>) => ({
  getItem: (k: string) => (k in data ? data[k] : null),
});

describe('resolveInitialTheme', () => {
  it('returns stored explicit choice', () => {
    expect(resolveInitialTheme(store({ 'template-ui-theme': 'light' }), true)).toBe('light');
  });

  it('ignores legacy theme in settings', () => {
    const s = store({ 'template-ui-settings': '{"theme":"dark","debugMode":true}' });
    expect(resolveInitialTheme(s, false)).toBe('light');
  });

  it('falls back to OS preference', () => {
    expect(resolveInitialTheme(store({}), true)).toBe('dark');
    expect(resolveInitialTheme(store({}), false)).toBe('light');
  });

  it('ignores invalid stored value', () => {
    expect(resolveInitialTheme(store({ 'template-ui-theme': 'purple' }), false)).toBe('light');
  });
});

describe('persistThemeChoice', () => {
  beforeEach(() => localStorage.clear());
  it('writes to the scoped theme key', () => {
    persistThemeChoice('dark');
    expect(localStorage.getItem(themeStorageKey())).toBe('dark');
  });
});
