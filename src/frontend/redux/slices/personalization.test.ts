import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scopedStorageKey } from '../../lib/app-paths';
import personalizationReducer, {
  addRule,
  persistRule,
  toggleRule,
} from './personalization';

const STORAGE_KEY = scopedStorageKey('template-ui-personalization');

describe('personalization slice — rules toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ rules: [] }), { status: 200 }))),
    );
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
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/personalization/rules') && init?.method === 'POST') {
        return Promise.resolve(new Response('{}', { status: 201 }));
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            rules: [
              {
                id: 'server-id',
                content: 'Always answer in Spanish',
                is_active: false,
                created_at: '2026-09-09T00:00:00Z',
              },
            ],
          }),
          { status: 200 },
        ),
      );
    });

    const store = configureStore({ reducer: { personalization: personalizationReducer } });
    store.dispatch(addRule('Always answer in Spanish'));
    const ruleId = store.getState().personalization.rules[0].id;
    store.dispatch(toggleRule(ruleId));

    await store.dispatch(
      persistRule({
        id: ruleId,
        content: 'Always answer in Spanish',
        isActive: false,
      }),
    );

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(postCall).toBeTruthy();
    const body = JSON.parse(String(postCall![1]?.body));
    expect(body).toMatchObject({
      id: ruleId,
      content: 'Always answer in Spanish',
      is_active: false,
    });
    expect(store.getState().personalization.rules[0]).toMatchObject({
      id: 'server-id',
      isActive: false,
    });
  });
});
