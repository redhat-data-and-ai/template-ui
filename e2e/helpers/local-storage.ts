import type { Page } from '@playwright/test';

const SETTINGS_KEY = 'template-ui-settings';

/**
 * Inject localStorage settings before the page loads.
 * Must be called before `page.goto()`.
 *
 * Merges the provided settings into the template-ui-settings key so
 * individual fields (e.g. alwaysAllowedTools) can be set independently.
 */
export async function setLocalStorageSettings(
  page: Page,
  settings: Partial<{
    theme: 'light' | 'dark';
    debugMode: boolean;
    alwaysAllowedTools: string[];
    autoApproveAllTools: boolean;
  }>,
): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      let existing: Record<string, unknown> = {};
      try {
        const raw = localStorage.getItem(key);
        if (raw) existing = JSON.parse(raw);
      } catch {
        // start fresh
      }
      localStorage.setItem(key, JSON.stringify({ ...existing, ...value }));
    },
    { key: SETTINGS_KEY, value: settings },
  );
}

/**
 * Read the stored template-ui-settings from localStorage after the page has
 * loaded. Returns null when the key is not set.
 */
export async function getLocalStorageSettings(
  page: Page,
): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }, SETTINGS_KEY);
}
