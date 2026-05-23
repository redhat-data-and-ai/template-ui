import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type Theme = 'light' | 'dark';

interface UserSettingsState {
  theme: Theme;
  memoryEnabled: boolean;
  debugMode: boolean;
}

const STORAGE_KEY = 'template-ui-settings';

function loadSettings(): UserSettingsState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // ignore
  }
  return {
    theme: 'dark',
    memoryEnabled: true,
    debugMode: false,
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
    setMemoryEnabled(state, action: PayloadAction<boolean>) {
      state.memoryEnabled = action.payload;
      persistSettings(state);
    },
    setDebugMode(state, action: PayloadAction<boolean>) {
      state.debugMode = action.payload;
      persistSettings(state);
    },
  },
});

export const { setTheme, toggleTheme, setMemoryEnabled, setDebugMode } = userSettingsSlice.actions;

export const selectTheme = (state: { userSettings: UserSettingsState }) => state.userSettings.theme;
export const selectMemoryEnabled = (state: { userSettings: UserSettingsState }) => state.userSettings.memoryEnabled;
export const selectDebugMode = (state: { userSettings: UserSettingsState }) => state.userSettings.debugMode;

export default userSettingsSlice.reducer;
