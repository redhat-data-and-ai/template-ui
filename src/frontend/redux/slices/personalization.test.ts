import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scopedStorageKey } from '../../lib/app-paths';
import personalizationReducer, {
  addRule,
  addRuleAndPersist,
  clearRules,
  deleteAllMemories,
  deleteMemory,
  fetchMemories,
  fetchRules,
  persistClearRules,
  persistRemoveRule,
  persistRule,
  removeRule,
  resetPersonalization,
  selectActiveRules,
  selectMemories,
  selectMemoriesLoading,
  selectPersonalizationError,
  selectRules,
  setRuleActive,
  toggleRule,
  updateRule,
} from './personalization';

vi.mock('../../services/authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

vi.mock('../../lib/app-paths', async (importOriginal) => {
  const actual = (await importOriginal()) as any;
  return {
    ...actual,
    buildAgentApiUrl: (path: string) => `/api/proxy/agent${path}`,
  };
});

import { authenticatedFetch } from '../../services/authenticated-fetch';

const STORAGE_KEY = scopedStorageKey('template-ui-personalization');

function makeStore() {
  return configureStore({ reducer: { personalization: personalizationReducer } });
}

function mockFetchOk(data: unknown) {
  vi.mocked(authenticatedFetch).mockResolvedValue(
    new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }),
  );
}

function mockFetchFail(status = 500) {
  vi.mocked(authenticatedFetch).mockResolvedValue(
    new Response('error', { status }),
  );
}

describe('personalization slice — rules toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(authenticatedFetch).mockReset();
    mockFetchOk({ rules: [] });
  });

  it('toggleRule persists isActive locally', () => {
    let state = personalizationReducer(undefined, { type: '@@INIT' });
    state = personalizationReducer(state, addRule('Always answer in Spanish'));
    const rule = state.rules[0];
    expect(rule.isActive).toBe(true);

    state = personalizationReducer(state, toggleRule(rule.id));

    expect(state.rules[0].isActive).toBe(false);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.rules[0].isActive).toBe(false);
  });

  it('persistRule POSTs the toggled flag then refetches from the API', async () => {
    vi.mocked(authenticatedFetch).mockImplementation(async (input: any, init?: any) => {
      if (init?.method === 'POST') {
        return new Response('{}', { status: 201 });
      }
      return new Response(
        JSON.stringify({
          rules: [{
            id: 'server-id',
            content: 'Always answer in Spanish',
            is_active: false,
            created_at: '2026-09-09T00:00:00Z',
          }],
        }),
        { status: 200 },
      );
    });

    const store = makeStore();
    store.dispatch(addRule('Always answer in Spanish'));
    const ruleId = store.getState().personalization.rules[0].id;
    store.dispatch(toggleRule(ruleId));

    await store.dispatch(
      persistRule({ id: ruleId, content: 'Always answer in Spanish', isActive: false }),
    );

    expect(store.getState().personalization.rules[0]).toMatchObject({
      id: 'server-id',
      isActive: false,
    });
  });
});

// ── Reducers ────────────────────────────────────────────────────────

describe('personalization slice — reducers', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('addRule prepends a new active rule', () => {
    const store = makeStore();
    store.dispatch(addRule('Be concise'));
    const rules = store.getState().personalization.rules;
    expect(rules).toHaveLength(1);
    expect(rules[0].content).toBe('Be concise');
    expect(rules[0].isActive).toBe(true);
  });

  it('updateRule changes content of existing rule', () => {
    const store = makeStore();
    store.dispatch(addRule('Old content'));
    const id = store.getState().personalization.rules[0].id;
    store.dispatch(updateRule({ id, content: 'New content' }));
    expect(store.getState().personalization.rules[0].content).toBe('New content');
  });

  it('updateRule ignores unknown id', () => {
    const store = makeStore();
    store.dispatch(addRule('Keep me'));
    store.dispatch(updateRule({ id: 'nope', content: 'X' }));
    expect(store.getState().personalization.rules[0].content).toBe('Keep me');
  });

  it('setRuleActive sets isActive flag', () => {
    const store = makeStore();
    store.dispatch(addRule('Test'));
    const id = store.getState().personalization.rules[0].id;
    store.dispatch(setRuleActive({ id, isActive: false }));
    expect(store.getState().personalization.rules[0].isActive).toBe(false);
  });

  it('setRuleActive ignores unknown id', () => {
    const store = makeStore();
    store.dispatch(addRule('Test'));
    store.dispatch(setRuleActive({ id: 'nope', isActive: false }));
    expect(store.getState().personalization.rules[0].isActive).toBe(true);
  });

  it('removeRule removes by id', () => {
    const store = makeStore();
    store.dispatch(addRule('A'));
    store.dispatch(addRule('B'));
    const idA = store.getState().personalization.rules[1].id;
    store.dispatch(removeRule(idA));
    expect(store.getState().personalization.rules).toHaveLength(1);
    expect(store.getState().personalization.rules[0].content).toBe('B');
  });

  it('clearRules empties rules array', () => {
    const store = makeStore();
    store.dispatch(addRule('A'));
    store.dispatch(addRule('B'));
    store.dispatch(clearRules());
    expect(store.getState().personalization.rules).toEqual([]);
  });

  it('resetPersonalization clears everything', () => {
    const store = makeStore();
    store.dispatch(addRule('Rule'));
    store.dispatch(resetPersonalization());
    const state = store.getState().personalization;
    expect(state.rules).toEqual([]);
    expect(state.memories).toEqual([]);
    expect(state.error).toBeNull();
  });
});

// ── Async thunks ────────────────────────────────────────────────────

describe('personalization slice — async thunks', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(authenticatedFetch).mockReset();
  });

  describe('fetchMemories', () => {
    it('populates memories on success', async () => {
      mockFetchOk([
        { id: 'm1', content: 'Likes Python', created_at: '2026-01-01T00:00:00Z' },
        { id: 'm2', content: 'Prefers dark mode', created_at: '2026-01-02T00:00:00Z' },
      ]);

      const store = makeStore();
      await store.dispatch(fetchMemories());

      expect(store.getState().personalization.memories).toEqual([
        { id: 'm1', content: 'Likes Python', createdAt: '2026-01-01T00:00:00Z' },
        { id: 'm2', content: 'Prefers dark mode', createdAt: '2026-01-02T00:00:00Z' },
      ]);
      expect(store.getState().personalization.memoriesLoading).toBe(false);
    });

    it('sets loading state while pending', async () => {
      let resolveFetch!: (v: Response) => void;
      vi.mocked(authenticatedFetch).mockReturnValue(
        new Promise((r) => { resolveFetch = r; }),
      );

      const store = makeStore();
      const promise = store.dispatch(fetchMemories());
      expect(store.getState().personalization.memoriesLoading).toBe(true);

      resolveFetch(new Response(JSON.stringify([]), { status: 200 }));
      await promise;
      expect(store.getState().personalization.memoriesLoading).toBe(false);
    });

    it('sets error on failure', async () => {
      mockFetchFail(500);
      const store = makeStore();
      await store.dispatch(fetchMemories());
      expect(store.getState().personalization.error).toContain('Failed to fetch memories');
    });
  });

  describe('fetchRules', () => {
    it('populates rules from API', async () => {
      mockFetchOk({
        rules: [
          { id: 'r1', content: 'Be concise', is_active: true, created_at: '2026-01-01T00:00:00Z' },
          { id: 'r2', content: 'Use code', is_active: false, created_at: '2026-01-02T00:00:00Z' },
        ],
      });

      const store = makeStore();
      await store.dispatch(fetchRules());

      expect(store.getState().personalization.rules).toEqual([
        { id: 'r1', content: 'Be concise', isActive: true, createdAt: '2026-01-01T00:00:00Z' },
        { id: 'r2', content: 'Use code', isActive: false, createdAt: '2026-01-02T00:00:00Z' },
      ]);
    });

    it('handles missing rules array', async () => {
      mockFetchOk({});
      const store = makeStore();
      await store.dispatch(fetchRules());
      expect(store.getState().personalization.rules).toEqual([]);
    });
  });

  describe('deleteMemory', () => {
    it('removes memory from state on success', async () => {
      mockFetchOk([
        { id: 'm1', content: 'A', created_at: '2026-01-01T00:00:00Z' },
      ]);
      const store = makeStore();
      await store.dispatch(fetchMemories());

      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 200 }));
      await store.dispatch(deleteMemory('m1'));
      expect(store.getState().personalization.memories).toEqual([]);
    });

    it('succeeds on 404 (already deleted)', async () => {
      mockFetchOk([{ id: 'm1', content: 'A', created_at: '2026-01-01T00:00:00Z' }]);
      const store = makeStore();
      await store.dispatch(fetchMemories());

      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 404 }));
      await store.dispatch(deleteMemory('m1'));
      expect(store.getState().personalization.memories).toEqual([]);
    });

    it('sets error on failure', async () => {
      mockFetchFail(500);
      const store = makeStore();
      await store.dispatch(deleteMemory('m1'));
      expect(store.getState().personalization.error).toContain('Failed to delete memory');
    });
  });

  describe('deleteAllMemories', () => {
    it('clears all memories on success', async () => {
      mockFetchOk([{ id: 'm1', content: 'A', created_at: '2026-01-01T00:00:00Z' }]);
      const store = makeStore();
      await store.dispatch(fetchMemories());

      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 200 }));
      await store.dispatch(deleteAllMemories());
      expect(store.getState().personalization.memories).toEqual([]);
    });

    it('sets error on failure', async () => {
      mockFetchFail(500);
      const store = makeStore();
      await store.dispatch(deleteAllMemories());
      expect(store.getState().personalization.error).toContain('Failed to delete all memories');
    });
  });

  describe('persistRemoveRule', () => {
    it('DELETEs the rule then refetches', async () => {
      vi.mocked(authenticatedFetch).mockImplementation(async (_input: any, init?: any) => {
        if (init?.method === 'DELETE') {
          return new Response('', { status: 200 });
        }
        return new Response(JSON.stringify({ rules: [] }), { status: 200 });
      });

      const store = makeStore();
      store.dispatch(addRule('To delete'));
      const id = store.getState().personalization.rules[0].id;
      await store.dispatch(persistRemoveRule(id));
      expect(store.getState().personalization.rules).toEqual([]);
    });

    it('sets error on non-404 failure', async () => {
      mockFetchFail(500);
      const store = makeStore();
      await store.dispatch(persistRemoveRule('r1'));
      expect(store.getState().personalization.error).toContain('Failed to delete rule');
    });
  });

  describe('persistClearRules', () => {
    it('DELETEs all rules then refetches', async () => {
      vi.mocked(authenticatedFetch).mockImplementation(async (_input: any, init?: any) => {
        if (init?.method === 'DELETE') {
          return new Response('', { status: 200 });
        }
        return new Response(JSON.stringify({ rules: [] }), { status: 200 });
      });

      const store = makeStore();
      store.dispatch(addRule('A'));
      store.dispatch(addRule('B'));
      await store.dispatch(persistClearRules());
      expect(store.getState().personalization.rules).toEqual([]);
    });

    it('sets error on failure', async () => {
      mockFetchFail(500);
      const store = makeStore();
      await store.dispatch(persistClearRules());
      expect(store.getState().personalization.error).toContain('Failed to clear rules');
    });
  });

  describe('addRuleAndPersist', () => {
    it('adds locally then persists to API', async () => {
      vi.mocked(authenticatedFetch).mockImplementation(async (_input: any, init?: any) => {
        if (init?.method === 'POST') {
          return new Response('{}', { status: 201 });
        }
        return new Response(JSON.stringify({ rules: [] }), { status: 200 });
      });

      const store = makeStore();
      await store.dispatch(addRuleAndPersist('New rule'));

      const calls = vi.mocked(authenticatedFetch).mock.calls;
      const postCall = calls.find(([, init]) => (init as any)?.method === 'POST');
      expect(postCall).toBeTruthy();
      const body = JSON.parse(String((postCall![1] as any)?.body));
      expect(body.content).toBe('New rule');
      expect(body.is_active).toBe(true);
    });
  });
});

// ── Selectors ───────────────────────────────────────────────────────

describe('personalization slice — selectors', () => {
  it('selectMemories returns memories array', () => {
    const state = { personalization: { memories: [{ id: 'm1', content: 'x', createdAt: '' }], rules: [], memoriesLoading: false, error: null } };
    expect(selectMemories(state)).toHaveLength(1);
  });

  it('selectRules returns all rules', () => {
    const state = { personalization: { memories: [], rules: [{ id: 'r1', content: 'x', isActive: true, createdAt: '' }], memoriesLoading: false, error: null } };
    expect(selectRules(state)).toHaveLength(1);
  });

  it('selectActiveRules filters to active only', () => {
    const state = {
      personalization: {
        memories: [],
        rules: [
          { id: 'r1', content: 'active', isActive: true, createdAt: '' },
          { id: 'r2', content: 'inactive', isActive: false, createdAt: '' },
        ],
        memoriesLoading: false,
        error: null,
      },
    };
    const active = selectActiveRules(state);
    expect(active).toHaveLength(1);
    expect(active[0].content).toBe('active');
  });

  it('selectMemoriesLoading returns loading state', () => {
    const state = { personalization: { memories: [], rules: [], memoriesLoading: true, error: null } };
    expect(selectMemoriesLoading(state)).toBe(true);
  });

  it('selectPersonalizationError returns error', () => {
    const state = { personalization: { memories: [], rules: [], memoriesLoading: false, error: 'Something failed' } };
    expect(selectPersonalizationError(state)).toBe('Something failed');
  });
});
