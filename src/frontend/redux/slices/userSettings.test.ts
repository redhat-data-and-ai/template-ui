import { describe, it, expect, beforeEach, vi } from 'vitest';
import { scopedStorageKey } from '../../lib/app-paths';
import userSettingsReducer, {
  addAlwaysAllowedTool,
  clearAlwaysAllowedTools,
  removeAlwaysAllowedTool,
  setAutoApproveAllTools,
  setConfigDefaults,
  setDebugMode,
  setTheme,
  toggleAutoApproveAllTools,
  toggleTheme,
} from './userSettings';

const STORAGE_KEY = scopedStorageKey('template-ui-settings');

function freshState() {
  // localStorage may have data from other tests; clear it first
  localStorage.removeItem(STORAGE_KEY);
  return userSettingsReducer(undefined, { type: '@@INIT' });
}

describe('userSettings slice', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── Theme ──────────────────────────────────────────────────────────────────
  it('setTheme sets the theme and persists to localStorage', () => {
    const s = userSettingsReducer(freshState(), setTheme('light'));
    expect(s.theme).toBe('light');
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.theme).toBe('light');
  });

  it('toggleTheme flips from dark to light', () => {
    const base = userSettingsReducer(freshState(), setTheme('dark'));
    const s = userSettingsReducer(base, toggleTheme());
    expect(s.theme).toBe('light');
  });

  it('toggleTheme flips from light to dark', () => {
    const base = userSettingsReducer(freshState(), setTheme('light'));
    const s = userSettingsReducer(base, toggleTheme());
    expect(s.theme).toBe('dark');
  });

  // ── Always-allowed tools ───────────────────────────────────────────────────
  it('addAlwaysAllowedTool adds a tool name', () => {
    const s = userSettingsReducer(freshState(), addAlwaysAllowedTool('github_search'));
    expect(s.alwaysAllowedTools).toContain('github_search');
  });

  it('addAlwaysAllowedTool is idempotent — no duplicates', () => {
    let s = userSettingsReducer(freshState(), addAlwaysAllowedTool('github_search'));
    s = userSettingsReducer(s, addAlwaysAllowedTool('github_search'));
    expect(s.alwaysAllowedTools.filter((t) => t === 'github_search')).toHaveLength(1);
  });

  it('removeAlwaysAllowedTool removes the tool', () => {
    let s = userSettingsReducer(freshState(), addAlwaysAllowedTool('github_search'));
    s = userSettingsReducer(s, addAlwaysAllowedTool('web_search'));
    s = userSettingsReducer(s, removeAlwaysAllowedTool('github_search'));
    expect(s.alwaysAllowedTools).not.toContain('github_search');
    expect(s.alwaysAllowedTools).toContain('web_search');
  });

  it('clearAlwaysAllowedTools empties the list', () => {
    let s = userSettingsReducer(freshState(), addAlwaysAllowedTool('a'));
    s = userSettingsReducer(s, addAlwaysAllowedTool('b'));
    s = userSettingsReducer(s, clearAlwaysAllowedTools());
    expect(s.alwaysAllowedTools).toHaveLength(0);
  });

  // ── Auto-approve all tools ─────────────────────────────────────────────────
  it('setAutoApproveAllTools sets the flag', () => {
    const s = userSettingsReducer(freshState(), setAutoApproveAllTools(true));
    expect(s.autoApproveAllTools).toBe(true);
  });

  it('toggleAutoApproveAllTools flips the flag', () => {
    let s = userSettingsReducer(freshState(), setAutoApproveAllTools(false));
    s = userSettingsReducer(s, toggleAutoApproveAllTools());
    expect(s.autoApproveAllTools).toBe(true);
    s = userSettingsReducer(s, toggleAutoApproveAllTools());
    expect(s.autoApproveAllTools).toBe(false);
  });

  // ── Debug mode ────────────────────────────────────────────────────────────
  it('setDebugMode sets debugMode and records user override', () => {
    const s = userSettingsReducer(freshState(), setDebugMode(true));
    expect(s.debugMode).toBe(true);
    expect(s._userOverrides.debugMode).toBe(true);
  });

  it('setConfigDefaults applies debug_mode_default when no user override', () => {
    const s = userSettingsReducer(freshState(), setConfigDefaults({ debug_mode_default: true }));
    expect(s.debugMode).toBe(true);
  });

  it('setConfigDefaults does NOT override when user has explicitly set debug mode', () => {
    let s = userSettingsReducer(freshState(), setDebugMode(false));
    s = userSettingsReducer(s, setConfigDefaults({ debug_mode_default: true }));
    // User said false, config says true — user wins
    expect(s.debugMode).toBe(false);
  });

  // ── localStorage persistence ───────────────────────────────────────────────
  it('settings changes are persisted to localStorage', () => {
    userSettingsReducer(freshState(), addAlwaysAllowedTool('my_tool'));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.alwaysAllowedTools).toContain('my_tool');
  });

  it('falls back to defaults when localStorage contains malformed JSON', async () => {
    localStorage.setItem(STORAGE_KEY, '{this is not valid json}');
    // Re-import forces loadSettings() to run fresh with the malformed data in localStorage
    vi.resetModules();
    const { default: freshReducer } = await import('./userSettings');
    const s = freshReducer(undefined, { type: '@@INIT' });
    expect(s.theme).toBe('dark'); // default
    expect(s.alwaysAllowedTools).toEqual([]); // default
  });

  it('loads persisted settings from localStorage on init', async () => {
    // Populate localStorage before the module is re-imported
    localStorage.setItem(
      'template-ui-settings',
      JSON.stringify({
        theme: 'light',
        alwaysAllowedTools: ['saved_tool'],
        autoApproveAllTools: false,
        _userOverrides: {},
        debugMode: false,
      }),
    );
    // Reset the module cache so userSettings.ts calls loadSettings() again
    // with the updated localStorage, re-computing initialState.
    vi.resetModules();
    const { default: freshReducer } = await import('./userSettings');
    const s = freshReducer(undefined, { type: '@@INIT' });
    expect(s.theme).toBe('light');
    expect(s.alwaysAllowedTools).toContain('saved_tool');
  });
});
