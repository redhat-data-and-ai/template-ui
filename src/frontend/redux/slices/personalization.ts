import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: string;
}

export interface RuleItem {
  id: string;
  content: string;
  isActive: boolean;
  createdAt: string;
}

interface PersonalizationState {
  memories: MemoryItem[];
  rules: RuleItem[];
}

function storageKey(): string {
  const userId = globalThis.window?.USER_DATA?.sub || globalThis.window?.USER_DATA?.preferred_username || '';
  return userId ? `template-ui-personalization:${userId}` : 'template-ui-personalization';
}

function loadState(): PersonalizationState {
  return { memories: [], rules: [] };
}

function persist(state: PersonalizationState) {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

const personalizationSlice = createSlice({
  name: 'personalization',
  initialState: loadState(),
  reducers: {
    addMemory(state, action: PayloadAction<string>) {
      state.memories.unshift({
        id: uuidv4(),
        content: action.payload,
        createdAt: new Date().toISOString(),
      });
      persist(state);
    },
    removeMemory(state, action: PayloadAction<string>) {
      state.memories = state.memories.filter((m) => m.id !== action.payload);
      persist(state);
    },
    setMemories(state, action: PayloadAction<Array<{ id: string; content: string }>>) {
      state.memories = action.payload.map((m) => ({
        id: m.id,
        content: m.content,
        createdAt: new Date().toISOString(),
      }));
      persist(state);
    },
    clearMemories(state) {
      state.memories = [];
      persist(state);
    },

    addRule(state, action: PayloadAction<string>) {
      state.rules.unshift({
        id: uuidv4(),
        content: action.payload,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      persist(state);
    },
    updateRule(state, action: PayloadAction<{ id: string; content: string }>) {
      const rule = state.rules.find((r) => r.id === action.payload.id);
      if (rule) rule.content = action.payload.content;
      persist(state);
    },
    toggleRule(state, action: PayloadAction<string>) {
      const rule = state.rules.find((r) => r.id === action.payload);
      if (rule) rule.isActive = !rule.isActive;
      persist(state);
    },
    removeRule(state, action: PayloadAction<string>) {
      state.rules = state.rules.filter((r) => r.id !== action.payload);
      persist(state);
    },
    clearRules(state) {
      state.rules = [];
      persist(state);
    },
    setRules(state, action: PayloadAction<Array<{ id: string; content: string; isActive: boolean }>>) {
      state.rules = action.payload.map((r) => ({
        ...r,
        createdAt: new Date().toISOString(),
      }));
      persist(state);
    },
    resetPersonalization(state) {
      state.memories = [];
      state.rules = [];
      persist(state);
    },
  },
});

export const {
  addMemory,
  setMemories,
  removeMemory,
  clearMemories,
  addRule,
  updateRule,
  toggleRule,
  removeRule,
  clearRules,
  setRules,
  resetPersonalization,
} = personalizationSlice.actions;

export const selectMemories = (state: { personalization: PersonalizationState }) =>
  state.personalization.memories;
export const selectRules = (state: { personalization: PersonalizationState }) =>
  state.personalization.rules;
export const selectActiveRules = createSelector(
  selectRules,
  (rules) => rules.filter((r) => r.isActive),
);

export default personalizationSlice.reducer;
