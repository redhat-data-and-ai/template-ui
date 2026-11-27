import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { scopedStorageKey } from '../../lib/app-paths';
import { persistThemeChoice, resolveInitialTheme, themeStorageKey } from '../../lib/theme-storage';

type Theme = 'light' | 'dark';

interface UserSettingsState {
  theme: Theme;
  debugMode: boolean;
  developerMode: boolean;
  alwaysAllowedTools: string[];
  autoApproveAllTools: boolean;
  _userOverrides: { debugMode?: boolean };
}

const STORAGE_KEY = scopedStorageKey('template-ui-settings');
// Resolved once so theme reads and writes always share a key, even if APP_DATA/location change later.
const THEME_KEY = themeStorageKey();

function initialTheme(): Theme {
  const prefersDark =
    typeof globalThis.matchMedia === 'function' &&
    globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
  return resolveInitialTheme(localStorage, prefersDark, THEME_KEY);
}

function loadSettings(): UserSettingsState {
  const theme = initialTheme();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        theme,
        debugMode: parsed.debugMode ?? false,
        developerMode: parsed.developerMode ?? false,
        alwaysAllowedTools: Array.isArray(parsed.alwaysAllowedTools) ? parsed.alwaysAllowedTools : [],
        autoApproveAllTools: parsed.autoApproveAllTools ?? false,
        _userOverrides: parsed._userOverrides ?? {},
      };
    }
  } catch {
    // ignore
  }
  return {
    theme,
    debugMode: false,
    developerMode: false,
    alwaysAllowedTools: [],
    autoApproveAllTools: false,
    _userOverrides: {},
  };
}

function persistSettings(settings: UserSettingsState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

const userSettingsSlice = createSlice({
  name: 'userSettings',
  initialState: loadSettings(),
  reducers: {
    setTheme(state, action: PayloadAction<Theme>) {
      state.theme = action.payload;
      persistThemeChoice(state.theme, THEME_KEY);
      persistSettings(state);
    },
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
      persistThemeChoice(state.theme, THEME_KEY);
      persistSettings(state);
    },
    setDebugMode(state, action: PayloadAction<boolean>) {
      state.debugMode = action.payload;
      state._userOverrides.debugMode = true;
      persistSettings(state);
    },
    setConfigDefaults(state, action: PayloadAction<{ debug_mode_default: boolean }>) {
      if (!state._userOverrides.debugMode) {
        state.debugMode = action.payload.debug_mode_default;
      }
      persistSettings(state);
    },
    addAlwaysAllowedTool(state, action: PayloadAction<string>) {
      if (!state.alwaysAllowedTools.includes(action.payload)) {
        state.alwaysAllowedTools.push(action.payload);
        persistSettings(state);
      }
    },
    removeAlwaysAllowedTool(state, action: PayloadAction<string>) {
      state.alwaysAllowedTools = state.alwaysAllowedTools.filter((t) => t !== action.payload);
      persistSettings(state);
    },
    clearAlwaysAllowedTools(state) {
      state.alwaysAllowedTools = [];
      persistSettings(state);
    },
    setDeveloperMode(state, action: PayloadAction<boolean>) {
      state.developerMode = action.payload;
      persistSettings(state);
    },
    setAutoApproveAllTools(state, action: PayloadAction<boolean>) {
      state.autoApproveAllTools = action.payload;
      persistSettings(state);
    },
    toggleAutoApproveAllTools(state) {
      state.autoApproveAllTools = !state.autoApproveAllTools;
      persistSettings(state);
    },
  },
});

export const {
  setTheme,
  toggleTheme,
  setDebugMode,
  setDeveloperMode,
  setConfigDefaults,
  addAlwaysAllowedTool,
  removeAlwaysAllowedTool,
  clearAlwaysAllowedTools,
  setAutoApproveAllTools,
  toggleAutoApproveAllTools,
} = userSettingsSlice.actions;

export const selectTheme = (state: { userSettings: UserSettingsState }) => state.userSettings.theme;
export const selectDebugMode = (state: { userSettings: UserSettingsState }) => state.userSettings.debugMode;
export const selectAlwaysAllowedTools = (state: { userSettings: UserSettingsState }) =>
  state.userSettings.alwaysAllowedTools;
export const selectAutoApproveAllTools = (state: { userSettings: UserSettingsState }) =>
  state.userSettings.autoApproveAllTools;
export const selectDeveloperMode = (state: { userSettings: UserSettingsState }) =>
  state.userSettings.developerMode;

export default userSettingsSlice.reducer;
