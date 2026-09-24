import { createAsyncThunk, createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { v4 as uuidv4 } from 'uuid';
import { buildAgentApiUrl, scopedStorageKey } from '../../lib/app-paths';
import { authenticatedFetch } from '../../services/authenticated-fetch';

// ── Memory items (individual facts from LangGraph Store) ────────────

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: string;
}

// ── Rules (origin/main localStorage + fire-and-forget API) ──────────

export interface RuleItem {
  id: string;
  content: string;
  isActive: boolean;
  createdAt: string;
}

interface PersonalizationState {
  memories: MemoryItem[];
  rules: RuleItem[];
  memoriesLoading: boolean;
  error: string | null;
}

const STORAGE_KEY = scopedStorageKey('template-ui-personalization');

function loadRules(): RuleItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as { rules?: RuleItem[] };
      if (Array.isArray(parsed.rules)) return parsed.rules;
    }
  } catch {
    /* ignore */
  }
  return [];
}

function persistRules(rules: RuleItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ memories: [], rules }));
  } catch {
    /* ignore */
  }
}

const initialState: PersonalizationState = {
  memories: [],
  rules: loadRules(),
  memoriesLoading: false,
  error: null,
};

// ── Memory thunks (memory-branch Store API) ─────────────────────────

export const fetchMemories = createAsyncThunk(
  'personalization/fetchMemories',
  async () => {
    const resp = await authenticatedFetch(buildAgentApiUrl('/personalization/memories'));
    if (!resp.ok) throw new Error(`Failed to fetch memories: ${resp.status}`);
    const data = await resp.json();
    return data.map((m: { id: string; content: string; created_at: string }) => ({
      id: m.id,
      content: m.content,
      createdAt: m.created_at,
    })) as MemoryItem[];
  },
);

export const fetchRules = createAsyncThunk(
  'personalization/fetchRules',
  async () => {
    const resp = await authenticatedFetch(buildAgentApiUrl('/personalization/rules'));
    if (!resp.ok) throw new Error(`Failed to fetch rules: ${resp.status}`);
    const data = (await resp.json()) as {
      rules?: { id: string; content: string; is_active?: boolean; created_at: string }[];
    };
    const rules = Array.isArray(data.rules) ? data.rules : [];
    return rules.map((r) => ({
      id: r.id,
      content: r.content,
      isActive: r.is_active !== false,
      createdAt: r.created_at,
    })) as RuleItem[];
  },
);

type PersonalizationRoot = { personalization: PersonalizationState };

type PersistRulePayload = { id: string; content: string; isActive: boolean };

export const persistRule = createAsyncThunk(
  'personalization/persistRule',
  async ({ id, content, isActive }: PersistRulePayload, { dispatch }) => {
    const resp = await authenticatedFetch(buildAgentApiUrl('/personalization/rules'), {
      method: 'POST',
      body: JSON.stringify({ id, content, is_active: isActive }),
    });
    if (!resp.ok) throw new Error(`Failed to save rule: ${resp.status}`);
    await dispatch(fetchRules()).unwrap();
  },
);

export const persistRemoveRule = createAsyncThunk(
  'personalization/persistRemoveRule',
  async (id: string, { dispatch }) => {
    const resp = await authenticatedFetch(
      buildAgentApiUrl(`/personalization/rules/${encodeURIComponent(id)}`),
      { method: 'DELETE' },
    );
    if (!resp.ok && resp.status !== 404)
      throw new Error(`Failed to delete rule: ${resp.status}`);
    await dispatch(fetchRules()).unwrap();
  },
);

export const persistClearRules = createAsyncThunk(
  'personalization/persistClearRules',
  async (_, { dispatch }) => {
    const resp = await authenticatedFetch(buildAgentApiUrl('/personalization/rules'), {
      method: 'DELETE',
    });
    if (!resp.ok) throw new Error(`Failed to clear rules: ${resp.status}`);
    await dispatch(fetchRules()).unwrap();
  },
);

export const deleteMemory = createAsyncThunk(
  'personalization/deleteMemory',
  async (memoryId: string) => {
    const resp = await authenticatedFetch(
      buildAgentApiUrl(`/personalization/memories/${encodeURIComponent(memoryId)}`),
      { method: 'DELETE' },
    );
    if (!resp.ok && resp.status !== 404)
      throw new Error(`Failed to delete memory: ${resp.status}`);
    return memoryId;
  },
);

export const deleteAllMemories = createAsyncThunk(
  'personalization/deleteAllMemories',
  async () => {
    const resp = await authenticatedFetch(buildAgentApiUrl('/personalization/memories'), {
      method: 'DELETE',
    });
    if (!resp.ok) throw new Error(`Failed to delete all memories: ${resp.status}`);
  },
);

// ── Slice ───────────────────────────────────────────────────────────

const personalizationSlice = createSlice({
  name: 'personalization',
  initialState,
  reducers: {
    addRule(state, action: PayloadAction<string>) {
      const id = uuidv4();
      state.rules.unshift({
        id,
        content: action.payload,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
      persistRules(state.rules);
    },
    updateRule(state, action: PayloadAction<{ id: string; content: string }>) {
      const rule = state.rules.find((r) => r.id === action.payload.id);
      if (rule) rule.content = action.payload.content;
      persistRules(state.rules);
    },
    toggleRule(state, action: PayloadAction<string>) {
      const rule = state.rules.find((r) => r.id === action.payload);
      if (!rule) return;
      rule.isActive = !rule.isActive;
      persistRules(state.rules);
    },
    setRuleActive(state, action: PayloadAction<{ id: string; isActive: boolean }>) {
      const rule = state.rules.find((r) => r.id === action.payload.id);
      if (!rule) return;
      rule.isActive = action.payload.isActive;
      persistRules(state.rules);
    },
    removeRule(state, action: PayloadAction<string>) {
      state.rules = state.rules.filter((r) => r.id !== action.payload);
      persistRules(state.rules);
    },
    clearRules(state) {
      state.rules = [];
      persistRules(state.rules);
    },
    resetPersonalization(state) {
      state.memories = [];
      state.rules = [];
      state.error = null;
      persistRules([]);
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMemories.pending, (state) => {
        state.memoriesLoading = true;
        state.error = null;
      })
      .addCase(fetchMemories.fulfilled, (state, action) => {
        state.memories = action.payload;
        state.memoriesLoading = false;
      })
      .addCase(fetchMemories.rejected, (state, action) => {
        state.memoriesLoading = false;
        state.error = action.error.message || 'Failed to load memories';
      })
      .addCase(fetchRules.fulfilled, (state, action) => {
        state.rules = action.payload;
        persistRules(state.rules);
      })
      .addCase(persistRule.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to save rule';
      })
      .addCase(persistRemoveRule.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to delete rule';
      })
      .addCase(persistClearRules.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to clear rules';
      })
      .addCase(deleteMemory.fulfilled, (state, action) => {
        state.memories = state.memories.filter((m) => m.id !== action.payload);
      })
      .addCase(deleteMemory.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to delete memory';
      })
      .addCase(deleteAllMemories.fulfilled, (state) => {
        state.memories = [];
      })
      .addCase(deleteAllMemories.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to delete all memories';
      });
  },
});

export const { addRule, updateRule, toggleRule, setRuleActive, removeRule, clearRules, resetPersonalization } =
  personalizationSlice.actions;

export const addRuleAndPersist = createAsyncThunk(
  'personalization/addRuleAndPersist',
  async (content: string, { dispatch, getState }) => {
    dispatch(addRule(content));
    const rule = (getState() as PersonalizationRoot).personalization.rules[0];
    if (rule) {
      await dispatch(
        persistRule({ id: rule.id, content: rule.content, isActive: rule.isActive }),
      ).unwrap();
    }
  },
);

export const selectMemories = (state: { personalization: PersonalizationState }) =>
  state.personalization.memories;
export const selectRules = (state: { personalization: PersonalizationState }) =>
  state.personalization.rules;
export const selectActiveRules = createSelector(selectRules, (rules) =>
  rules.filter((r) => r.isActive),
);
export const selectMemoriesLoading = (state: { personalization: PersonalizationState }) =>
  state.personalization.memoriesLoading;
export const selectPersonalizationError = (state: { personalization: PersonalizationState }) =>
  state.personalization.error;

export default personalizationSlice.reducer;
