import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';

export interface ReferenceChunk {
  chunk_id: string;
  doc_title: string;
  raw_doc_title: string;
  page: number;
  text: string;
  score: number;
  crop_path?: string;
  section?: string;
  doc_id?: string;
  search_query?: string;
  bbox?: [number, number, number, number];
}

export interface QueryGroup {
  query: string;
  chunks: ReferenceChunk[];
}

interface ReferencesState {
  queryGroups: QueryGroup[];
  selectedChunkId: string | null;
  panelOpen: boolean;
  detailOpen: boolean;
  activeQueryIndex: number;
}

const initialState: ReferencesState = {
  queryGroups: [],
  selectedChunkId: null,
  panelOpen: false,
  detailOpen: false,
  activeQueryIndex: 0,
};

function groupByQuery(chunks: ReferenceChunk[]): QueryGroup[] {
  const map = new Map<string, ReferenceChunk[]>();
  for (const c of chunks) {
    const key = c.search_query ?? 'Search results';
    const arr = map.get(key);
    if (arr) {
      arr.push(c);
    } else {
      map.set(key, [c]);
    }
  }
  return Array.from(map.entries()).map(([query, items]) => ({ query, chunks: items }));
}

const referencesSlice = createSlice({
  name: 'references',
  initialState,
  reducers: {
    setChunks(state, action: PayloadAction<ReferenceChunk[]>) {
      state.queryGroups = groupByQuery(action.payload);
      state.activeQueryIndex = 0;
      if (action.payload.length > 0 && !state.panelOpen) {
        state.panelOpen = true;
      }
      if (action.payload.length === 0) {
        state.panelOpen = false;
        state.detailOpen = false;
        state.selectedChunkId = null;
      }
    },
    selectChunk(state, action: PayloadAction<string>) {
      state.selectedChunkId = action.payload;
      state.detailOpen = true;
    },
    closeDetail(state) {
      state.detailOpen = false;
      state.selectedChunkId = null;
    },
    setActiveQuery(state, action: PayloadAction<number>) {
      state.activeQueryIndex = action.payload;
      state.detailOpen = false;
      state.selectedChunkId = null;
    },
    togglePanel(state) {
      state.panelOpen = !state.panelOpen;
      if (!state.panelOpen) {
        state.detailOpen = false;
        state.selectedChunkId = null;
      }
    },
    clearReferences(state) {
      state.queryGroups = [];
      state.selectedChunkId = null;
      state.panelOpen = false;
      state.detailOpen = false;
      state.activeQueryIndex = 0;
    },
  },
});

export const {
  setChunks,
  selectChunk,
  closeDetail,
  setActiveQuery,
  togglePanel,
  clearReferences,
} = referencesSlice.actions;

export const selectQueryGroups = (state: RootState) => state.references.queryGroups;
export const selectActiveQueryIndex = (state: RootState) => state.references.activeQueryIndex;
export const selectActiveGroup = (state: RootState) => {
  const { queryGroups, activeQueryIndex } = state.references;
  return queryGroups[activeQueryIndex] ?? null;
};
export const selectAllChunks = (state: RootState) =>
  state.references.queryGroups.flatMap((g) => g.chunks);
export const selectSelectedChunk = (state: RootState) => {
  const { queryGroups, selectedChunkId } = state.references;
  if (!selectedChunkId) return null;
  for (const g of queryGroups) {
    const found = g.chunks.find((c) => c.chunk_id === selectedChunkId);
    if (found) return found;
  }
  return null;
};
export const selectPanelOpen = (state: RootState) => state.references.panelOpen;
export const selectDetailOpen = (state: RootState) => state.references.detailOpen;

export default referencesSlice.reducer;
