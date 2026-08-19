import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';
import { buildAgentApiUrl } from '../../lib/app-paths';
import { authenticatedFetch } from '../../services/authenticated-fetch';

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

const STORAGE_KEY = 'template-ui-personalization';

function loadState(): PersonalizationState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  return { memories: [], rules: [] };
}

function persist(state: PersonalizationState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

function apiCreateMemory(id: string, content: string) {
  authenticatedFetch(buildAgentApiUrl('/personalization/memories'), {
    method: 'POST',
    body: JSON.stringify({ id, content }),
  }).catch(() => {});
}

function apiDeleteMemory(id: string) {
  authenticatedFetch(buildAgentApiUrl(`/personalization/memories/${id}`), {
    method: 'DELETE',
  }).catch(() => {});
}

function apiCreateRule(id: string, content: string, isActive: boolean) {
  authenticatedFetch(buildAgentApiUrl('/personalization/rules'), {
    method: 'POST',
    body: JSON.stringify({ id, content, is_active: isActive }),
  }).catch(() => {});
}

function apiDeleteRule(id: string) {
  authenticatedFetch(buildAgentApiUrl(`/personalization/rules/${id}`), {
    method: 'DELETE',
  }).catch(() => {});
}

const personalizationSlice = createSlice({
  name: 'personalization',
  initialState: loadState(),
  reducers: {
    addMemory(state, action: PayloadAction<string>) {
      const id = uuidv4();
      state.memories.unshift({
        id,
        content: action.payload,
        createdAt: new Date().toISOString(),
      });
      persist(state);
      apiCreateMemory(id, action.payload);
    },
    removeMemory(state, action: PayloadAction<string>) {
      state.memories = state.memories.filter((m) => m.id !== action.payload);
      persist(state);
      apiDeleteMemory(action.payload);
    },
    clearMemories(state) {
      const ids = state.memories.map((m) => m.id);
      state.memories = [];
      persist(state);
      ids.forEach(apiDeleteMemory);
    },

    addRule(state, action: PayloadAction<string>) {
      const id = uuidv4();
      state.rules.unshift({
        id,
        content: action.payload,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      persist(state);
      apiCreateRule(id, action.payload, true);
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
      apiDeleteRule(action.payload);
    },
    clearRules(state) {
      const ids = state.rules.map((r) => r.id);
      state.rules = [];
      persist(state);
      ids.forEach(apiDeleteRule);
    },
    resetPersonalization(state) {
      const memIds = state.memories.map((m) => m.id);
      const ruleIds = state.rules.map((r) => r.id);
      state.memories = [];
      state.rules = [];
      persist(state);
      memIds.forEach(apiDeleteMemory);
      ruleIds.forEach(apiDeleteRule);
    },
  },
});

export const {
  addMemory,
  removeMemory,
  clearMemories,
  addRule,
  updateRule,
  toggleRule,
  removeRule,
  clearRules,
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
