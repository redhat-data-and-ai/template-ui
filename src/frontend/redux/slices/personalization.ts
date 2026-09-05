import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import { buildAgentApiUrl } from '../../lib/app-paths';
import { authenticatedFetch } from '../../services/authenticated-fetch';

// ── Memory items (individual facts from LangGraph Store) ────────────

export interface MemoryItem {
  id: string;
  content: string;
  createdAt: string;
}

// ── Rules (PersonalizationRepository) ───────────────────────────────

export interface RuleItem {
  id: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PersonalizationState {
  memories: MemoryItem[];
  rules: RuleItem[];
  memoriesLoading: boolean;
  rulesLoading: boolean;
  error: string | null;
}

const initialState: PersonalizationState = {
  memories: [],
  rules: [],
  memoriesLoading: false,
  rulesLoading: false,
  error: null,
};

// ── Memory thunks ───────────────────────────────────────────────────

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

// ── Rule thunks ─────────────────────────────────────────────────────

export const fetchRules = createAsyncThunk('personalization/fetchRules', async () => {
  const resp = await authenticatedFetch(buildAgentApiUrl('/personalization/rules'));
  if (!resp.ok) throw new Error(`Failed to fetch rules: ${resp.status}`);
  const data = await resp.json();
  return data.map(
    (r: {
      id: string;
      content: string;
      is_active: boolean;
      created_at: string;
      updated_at: string;
    }) => ({
      id: r.id,
      content: r.content,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }),
  ) as RuleItem[];
});

export const addRule = createAsyncThunk('personalization/addRule', async (content: string) => {
  const resp = await authenticatedFetch(buildAgentApiUrl('/personalization/rules'), {
    method: 'POST',
    body: JSON.stringify({ content, is_active: true }),
  });
  if (!resp.ok) throw new Error(`Failed to create rule: ${resp.status}`);
  const r = await resp.json();
  return {
    id: r.id,
    content: r.content,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  } as RuleItem;
});

export const removeRule = createAsyncThunk('personalization/removeRule', async (ruleId: string) => {
  const resp = await authenticatedFetch(
    buildAgentApiUrl(`/personalization/rules/${encodeURIComponent(ruleId)}`),
    { method: 'DELETE' },
  );
  if (!resp.ok && resp.status !== 404) throw new Error(`Failed to delete rule: ${resp.status}`);
  return ruleId;
});

export const deleteAllRules = createAsyncThunk('personalization/deleteAllRules', async () => {
  const resp = await authenticatedFetch(buildAgentApiUrl('/personalization/rules'), {
    method: 'DELETE',
  });
  if (!resp.ok) throw new Error(`Failed to delete all rules: ${resp.status}`);
});

// ── Slice ───────────────────────────────────────────────────────────

const personalizationSlice = createSlice({
  name: 'personalization',
  initialState,
  reducers: {
    resetPersonalization() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      // Memories
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
      })

      // Rules (Preferences)
      .addCase(fetchRules.pending, (state) => {
        state.rulesLoading = true;
        state.error = null;
      })
      .addCase(fetchRules.fulfilled, (state, action) => {
        state.rules = action.payload;
        state.rulesLoading = false;
      })
      .addCase(fetchRules.rejected, (state, action) => {
        state.rulesLoading = false;
        state.error = action.error.message || 'Failed to load rules';
      })
      .addCase(addRule.fulfilled, (state, action) => {
        state.rules.unshift(action.payload);
      })
      .addCase(addRule.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to create rule';
      })
      .addCase(removeRule.fulfilled, (state, action) => {
        state.rules = state.rules.filter((r) => r.id !== action.payload);
      })
      .addCase(removeRule.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to delete rule';
      })
      .addCase(deleteAllRules.fulfilled, (state) => {
        state.rules = [];
      })
      .addCase(deleteAllRules.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to delete all rules';
      });
  },
});

export const { resetPersonalization } = personalizationSlice.actions;

// ── Selectors ───────────────────────────────────────────────────────

export const selectMemories = (state: { personalization: PersonalizationState }) =>
  state.personalization.memories;
export const selectRules = (state: { personalization: PersonalizationState }) =>
  state.personalization.rules;
export const selectActiveRules = createSelector(selectRules, (rules) =>
  rules.filter((r) => r.isActive),
);
export const selectMemoriesLoading = (state: { personalization: PersonalizationState }) =>
  state.personalization.memoriesLoading;
export const selectRulesLoading = (state: { personalization: PersonalizationState }) =>
  state.personalization.rulesLoading;
export const selectPersonalizationError = (state: { personalization: PersonalizationState }) =>
  state.personalization.error;

export default personalizationSlice.reducer;
