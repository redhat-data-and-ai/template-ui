import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type Theme = 'light' | 'dark';

interface UserSettingsState {
  theme: Theme;
  debugMode: boolean;
  _userOverrides: { debugMode?: boolean };
}

const STORAGE_KEY = 'template-ui-settings';

function loadSettings(): UserSettingsState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        theme: parsed.theme ?? 'dark',
        debugMode: parsed.debugMode ?? false,
        _userOverrides: parsed._userOverrides ?? {},
      };
    }
  } catch {
    // ignore
  }
  return {
    theme: 'dark',
    debugMode: false,
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
      persistSettings(state);
    },
    toggleTheme(state) {
      state.theme = state.theme === 'dark' ? 'light' : 'dark';
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
  },
});

export const { setTheme, toggleTheme, setDebugMode, setConfigDefaults } = userSettingsSlice.actions;

export const selectTheme = (state: { userSettings: UserSettingsState }) => state.userSettings.theme;
export const selectDebugMode = (state: { userSettings: UserSettingsState }) => state.userSettings.debugMode;

export default userSettingsSlice.reducer;
