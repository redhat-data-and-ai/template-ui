import { createAsyncThunk, createSelector, createSlice } from '@reduxjs/toolkit';
import { buildAgentApiUrl } from '../../lib/app-paths';
import { authenticatedFetch } from '../../services/authenticated-fetch';

export interface MemoryItem {
  id: string;
  content: string;
  score: number;
  createdAt: string;
  updatedAt: string;
}

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
  loading: boolean;
  error: string | null;
}

const initialState: PersonalizationState = {
  memories: [],
  rules: [],
  loading: false,
  error: null,
};

// ── Async thunks ────────────────────────────────────────────────────

export const fetchMemories = createAsyncThunk(
  'personalization/fetchMemories',
  async () => {
    const resp = await authenticatedFetch(buildAgentApiUrl('/personalization/memories'));
    if (!resp.ok) throw new Error(`Failed to fetch memories: ${resp.status}`);
    const data = await resp.json();
    return data.map((m: { id: string; content: string; score: number; created_at: string; updated_at: string }) => ({
      id: m.id,
      content: m.content,
      score: m.score,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    })) as MemoryItem[];
  },
);

export const addMemory = createAsyncThunk(
  'personalization/addMemory',
  async (content: string) => {
    const resp = await authenticatedFetch(buildAgentApiUrl('/personalization/memories'), {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
    if (!resp.ok) throw new Error(`Failed to create memory: ${resp.status}`);
    const m = await resp.json();
    return {
      id: m.id,
      content: m.content,
      score: m.score,
      createdAt: m.created_at,
      updatedAt: m.updated_at,
    } as MemoryItem;
  },
);

export const removeMemory = createAsyncThunk(
  'personalization/removeMemory',
  async (memoryId: string) => {
    const resp = await authenticatedFetch(
      buildAgentApiUrl(`/personalization/memories/${encodeURIComponent(memoryId)}`),
      { method: 'DELETE' },
    );
    if (!resp.ok && resp.status !== 404) throw new Error(`Failed to delete memory: ${resp.status}`);
    return memoryId;
  },
);

export const fetchRules = createAsyncThunk(
  'personalization/fetchRules',
  async () => {
    const resp = await authenticatedFetch(buildAgentApiUrl('/personalization/rules'));
    if (!resp.ok) throw new Error(`Failed to fetch rules: ${resp.status}`);
    const data = await resp.json();
    return data.map((r: { id: string; content: string; is_active: boolean; created_at: string; updated_at: string }) => ({
      id: r.id,
      content: r.content,
      isActive: r.is_active,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })) as RuleItem[];
  },
);

export const addRule = createAsyncThunk(
  'personalization/addRule',
  async (content: string) => {
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
  },
);

export const removeRule = createAsyncThunk(
  'personalization/removeRule',
  async (ruleId: string) => {
    const resp = await authenticatedFetch(
      buildAgentApiUrl(`/personalization/rules/${encodeURIComponent(ruleId)}`),
      { method: 'DELETE' },
    );
    if (!resp.ok && resp.status !== 404) throw new Error(`Failed to delete rule: ${resp.status}`);
    return ruleId;
  },
);

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
    // Memories
    builder
      .addCase(fetchMemories.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMemories.fulfilled, (state, action) => {
        state.memories = action.payload;
        state.loading = false;
      })
      .addCase(fetchMemories.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load memories';
      })
      .addCase(addMemory.fulfilled, (state, action) => {
        state.memories.unshift(action.payload);
      })
      .addCase(removeMemory.fulfilled, (state, action) => {
        state.memories = state.memories.filter((m) => m.id !== action.payload);
      })

    // Rules
      .addCase(fetchRules.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRules.fulfilled, (state, action) => {
        state.rules = action.payload;
        state.loading = false;
      })
      .addCase(fetchRules.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to load rules';
      })
      .addCase(addRule.fulfilled, (state, action) => {
        state.rules.unshift(action.payload);
      })
      .addCase(removeRule.fulfilled, (state, action) => {
        state.rules = state.rules.filter((r) => r.id !== action.payload);
      });
  },
});

export const { resetPersonalization } = personalizationSlice.actions;

// ── Selectors ───────────────────────────────────────────────────────

export const selectMemories = (state: { personalization: PersonalizationState }) =>
  state.personalization.memories;
export const selectRules = (state: { personalization: PersonalizationState }) =>
  state.personalization.rules;
export const selectActiveRules = createSelector(
  selectRules,
  (rules) => rules.filter((r) => r.isActive),
);
export const selectPersonalizationLoading = (state: { personalization: PersonalizationState }) =>
  state.personalization.loading;
export const selectPersonalizationError = (state: { personalization: PersonalizationState }) =>
  state.personalization.error;

export default personalizationSlice.reducer;
