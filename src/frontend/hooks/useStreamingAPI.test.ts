import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import type { Message } from '@langchain/langgraph-sdk';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import chatsReducer, { addChat } from '../redux/slices/chats';
import configReducer from '../redux/slices/config';
import personalizationReducer from '../redux/slices/personalization';
import toastsReducer from '../redux/slices/toasts';
import userSettingsReducer, { addAlwaysAllowedTool } from '../redux/slices/userSettings';
import { useStreamingAPI } from './useStreamingAPI';

// ── Store factory ─────────────────────────────────────────────────────────────

function makeStore(preloadedState?: Record<string, unknown>) {
  return configureStore({
    reducer: {
      chats: chatsReducer,
      config: configReducer,
      personalization: personalizationReducer,
      toasts: toastsReducer,
      userSettings: userSettingsReducer,
    },
    preloadedState,
  });
}

function makeWrapper(store: ReturnType<typeof makeStore>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(Provider, { store }, children);
  };
}

const THREAD_ID = 'test-thread';

function seedChat(store: ReturnType<typeof makeStore>) {
  store.dispatch(
    addChat({
      id: THREAD_ID,
      title: 'Test',
      timestamp: new Date().toISOString(),
      preview: '',
      messages: [],
      historicalActivities: {},
      feedback: {},
    }),
  );
}

// ── checkAndAutoApprove ───────────────────────────────────────────────────────

describe('useStreamingAPI — checkAndAutoApprove', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    localStorage.clear();
    store = makeStore();
    seedChat(store);
  });

  it('returns allAutoApproved=true when all action_requests are in alwaysAllowedTools', () => {
    store.dispatch(addAlwaysAllowedTool('create_pr'));
    store.dispatch(addAlwaysAllowedTool('web_search'));

    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });

    const interruptValue = {
      action_requests: [
        { name: 'create_pr', args: {} },
        { name: 'web_search', args: {} },
      ],
      review_configs: [],
    };

    const { allAutoApproved, decisions } = result.current.checkAndAutoApprove(interruptValue);
    expect(allAutoApproved).toBe(true);
    expect(decisions.every((d) => d.type === 'approve')).toBe(true);
  });

  it('returns allAutoApproved=false when any action_request is not in alwaysAllowedTools', () => {
    store.dispatch(addAlwaysAllowedTool('web_search'));

    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });

    const interruptValue = {
      action_requests: [
        { name: 'create_pr', args: {} }, // NOT allowed
        { name: 'web_search', args: {} }, // allowed
      ],
      review_configs: [],
    };

    const { allAutoApproved } = result.current.checkAndAutoApprove(interruptValue);
    expect(allAutoApproved).toBe(false);
  });

  it('auto-approves when the subagent_type arg matches an allowed tool', () => {
    store.dispatch(addAlwaysAllowedTool('analyst'));

    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });

    const interruptValue = {
      action_requests: [{ name: 'task', args: { subagent_type: 'analyst' } }],
      review_configs: [],
    };

    const { allAutoApproved } = result.current.checkAndAutoApprove(interruptValue);
    expect(allAutoApproved).toBe(true);
  });

  it('returns allAutoApproved=true for an empty action_requests list', () => {
    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });

    const { allAutoApproved } = result.current.checkAndAutoApprove({
      action_requests: [],
      review_configs: [],
    });
    expect(allAutoApproved).toBe(true);
  });

  it('returns allAutoApproved=false when alwaysAllowedTools is empty', () => {
    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });

    const interruptValue = {
      action_requests: [{ name: 'create_pr', args: {} }],
      review_configs: [],
    };

    const { allAutoApproved } = result.current.checkAndAutoApprove(interruptValue);
    expect(allAutoApproved).toBe(false);
  });

  // NOTE: the autoApproveAllTools flag bypass is handled at the ChatPage level
  // (ChatPage.tsx's useEffect calls resumeWithDecisions directly when the flag is true)
  // rather than inside checkAndAutoApprove itself.  The E2E suite (auto-approve.spec.ts)
  // covers that path end-to-end.
});

// ── Initial state & stop() ────────────────────────────────────────────────────

describe('useStreamingAPI — initial state and stop()', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    localStorage.clear();
    store = makeStore();
    seedChat(store);
    vi.stubGlobal('fetch', vi.fn()); // prevent real network calls
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts idle with null pendingInterrupt and retryCount 0', () => {
    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.pendingInterrupt).toBeNull();
    expect(result.current.retryCount).toBe(0);
    expect(result.current.wasInterrupted).toBe(false);
  });

  it('stop() is safe to call when idle (no error thrown)', () => {
    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });

    // stop() on an idle hook should not throw and should leave state unchanged
    act(() => {
      result.current.stop();
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('setMessages() updates the messages visible in the hook', () => {
    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });

    const fakeMsg = { type: 'ai', content: 'injected', id: 'injected-1', tool_calls: [] };
    act(() => {
      result.current.setMessages([fakeMsg as Parameters<typeof result.current.setMessages>[0][number]]);
    });

    // The hook exposes the messages it was given
    expect(result.current.messages).toHaveLength(1);
    expect((result.current.messages[0] as { id: string }).id).toBe('injected-1');
  });

  it('submit() transitions isLoading to true while a stream is in flight', async () => {
    // Return a stream that never resolves so we can observe the loading state
    vi.mocked(fetch).mockImplementationOnce(
      () => new Promise(() => { /* never resolves — allows us to observe isLoading: true */ }),
    );

    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });

    // submit() takes { messages: Message[] }; seed with a human message so the hook
    // proceeds past the "empty message text" guard and actually calls fetch
    const userMessage = {
      type: 'human',
      content: 'hello world',
      id: 'user-msg-1',
    } as unknown as Message;

    act(() => void result.current.submit({ messages: [userMessage] }));

    // isLoading should become true once the hook's setStreamingState fires
    await waitFor(() => expect(result.current.isLoading).toBe(true));

    // Clean up the in-flight request
    act(() => result.current.stop());
  });
});
