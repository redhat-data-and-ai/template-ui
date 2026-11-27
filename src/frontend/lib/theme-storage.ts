import { scopedStorageKey } from './app-paths';

export const THEME_STORAGE_BASE = 'template-ui-theme';

export type ThemeChoice = 'light' | 'dark';

export function themeStorageKey(): string {
  return scopedStorageKey(THEME_STORAGE_BASE);
}

/**
 * Explicit stored choice wins; otherwise follow the OS preference.
 * The legacy `theme` field inside `template-ui-settings` is deliberately ignored.
 * Keep the rule in sync with the pre-paint script in index.html.
 */
export function resolveInitialTheme(
  storage: Pick<Storage, 'getItem'>,
  prefersDark: boolean,
  key: string = themeStorageKey(),
): ThemeChoice {
  try {
    const stored = storage.getItem(key);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // storage unavailable
  }
  return prefersDark ? 'dark' : 'light';
}

export function persistThemeChoice(theme: ThemeChoice, key: string = themeStorageKey()): void {
  try {
    localStorage.setItem(key, theme);
  } catch {
    // ignore
  }
}
