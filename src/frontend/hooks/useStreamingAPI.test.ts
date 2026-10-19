import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { act, waitFor } from '@testing-library/react';
import type { Message } from '@langchain/langgraph-sdk';
import { renderHook } from '@testing-library/react';
import { Provider } from 'react-redux';
import React from 'react';
import { configureStore } from '@reduxjs/toolkit';
import chatsReducer, { addChat, selectStreamingState, updateChat } from '../redux/slices/chats';
import configReducer from '../redux/slices/config';
import personalizationReducer from '../redux/slices/personalization';
import toastsReducer from '../redux/slices/toasts';
import userSettingsReducer, { addAlwaysAllowedTool } from '../redux/slices/userSettings';
import projectsReducer from '../redux/slices/projects';
import { useStreamingAPI, RECOVERY_POLL_TIMEOUT_MS, _startRecoveryPolling, isNonRecoverableHttpStatus } from './useStreamingAPI';
import * as projectsApi from '../services/projects-api';
import { markChatAsClientCreated, unmarkChatAsClientCreated } from '../services/newChatTracker';

vi.mock('../services/projects-api', () => ({
  getProjects: vi.fn(async () => []),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  deleteProject: vi.fn(),
  assignThreadToProject: vi.fn(async () => undefined),
  unassignAllThreadsFromProject: vi.fn(),
  getThreadsByProject: vi.fn(async () => []),
}));

// ── Store factory ─────────────────────────────────────────────────────────────

function makeStore() {
  return configureStore({
    reducer: {
      chats: chatsReducer,
      config: configReducer,
      personalization: personalizationReducer,
      toasts: toastsReducer,
      userSettings: userSettingsReducer,
      projects: projectsReducer,
    },
  });
}

function makeWrapper(store: ReturnType<typeof makeStore>) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(Provider, { store, children });
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

  it('stamps the current project_id even if submit was created before assign', async () => {
    const fetchMock = vi.fn(
      () => new Promise(() => { /* never resolves */ }),
    );
    vi.mocked(fetch).mockImplementation(fetchMock as unknown as typeof fetch);

    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });
    const submitBeforeAssign = result.current.submit;

    act(() => {
      store.dispatch(updateChat({ id: THREAD_ID, updates: { project_id: 'p-new' } }));
    });

    const userMessage = {
      type: 'human',
      content: 'hello world',
      id: 'user-msg-1',
    } as unknown as Message;

    act(() => void submitBeforeAssign({ messages: [userMessage] }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(JSON.parse(init.body).project_id).toBe('p-new');

    act(() => result.current.stop());
  });

  it('persists folder membership after the first successful stream of a client-created chat', async () => {
    markChatAsClientCreated(THREAD_ID);
    store.dispatch(updateChat({ id: THREAD_ID, updates: { project_id: 'p1' } }));
    vi.mocked(projectsApi.assignThreadToProject).mockResolvedValue();

    const encoder = new TextEncoder();
    const sseBody =
      `data: ${JSON.stringify({ type: 'token', content: 'Hi', chunk_id: 0 })}\n\n` +
      'data: [DONE]\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });
    const userMessage = {
      type: 'human',
      content: 'hello world',
      id: 'user-msg-1',
    } as unknown as Message;

    await act(async () => {
      await result.current.submit({ messages: [userMessage] });
    });

    await waitFor(() => {
      expect(projectsApi.assignThreadToProject).toHaveBeenCalledWith(THREAD_ID, 'p1');
    });
    unmarkChatAsClientCreated(THREAD_ID);
  });

  it('does not persist folder membership for a chat that already exists on the server', async () => {
    unmarkChatAsClientCreated(THREAD_ID);
    store.dispatch(updateChat({ id: THREAD_ID, updates: { project_id: 'p1' } }));
    vi.mocked(projectsApi.assignThreadToProject).mockClear();

    const encoder = new TextEncoder();
    const sseBody =
      `data: ${JSON.stringify({ type: 'token', content: 'Hi', chunk_id: 0 })}\n\n` +
      'data: [DONE]\n\n';
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sseBody));
        controller.close();
      },
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      }),
    );

    const { result } = renderHook(() => useStreamingAPI(THREAD_ID), {
      wrapper: makeWrapper(store),
    });
    const userMessage = {
      type: 'human',
      content: 'hello world',
      id: 'user-msg-2',
    } as unknown as Message;

    await act(async () => {
      await result.current.submit({ messages: [userMessage] });
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(projectsApi.assignThreadToProject).not.toHaveBeenCalled();
  });
});

// ── isNonRecoverableHttpStatus ────────────────────────────────────────────────

describe('isNonRecoverableHttpStatus', () => {
  it('treats 400 (Bad Request) as non-recoverable', () => {
    expect(isNonRecoverableHttpStatus(400)).toBe(true);
  });

  it('treats 401 (Unauthorized) as non-recoverable', () => {
    expect(isNonRecoverableHttpStatus(401)).toBe(true);
  });

  it('treats 404 (Not Found) as non-recoverable', () => {
    expect(isNonRecoverableHttpStatus(404)).toBe(true);
  });

  it('treats 422 (Unprocessable Entity) as non-recoverable', () => {
    expect(isNonRecoverableHttpStatus(422)).toBe(true);
  });

  it('treats 429 (Too Many Requests) as non-recoverable (4xx)', () => {
    expect(isNonRecoverableHttpStatus(429)).toBe(true);
  });

  it('treats 500 (Internal Server Error) as non-recoverable', () => {
    expect(isNonRecoverableHttpStatus(500)).toBe(true);
  });

  it('treats 502 (Bad Gateway) as recoverable', () => {
    expect(isNonRecoverableHttpStatus(502)).toBe(false);
  });

  it('treats 503 (Service Unavailable) as recoverable', () => {
    expect(isNonRecoverableHttpStatus(503)).toBe(false);
  });

  it('treats 504 (Gateway Timeout) as recoverable', () => {
    expect(isNonRecoverableHttpStatus(504)).toBe(false);
  });

  it('treats 200 (OK) as recoverable (not an error status)', () => {
    expect(isNonRecoverableHttpStatus(200)).toBe(false);
  });
});

// ── Recovery timeout independence ────────────────────────────────────────────

// Spread the real module rather than listing exports. Naming only the
// two this suite stubs meant anything else the hook reached for was
// simply absent from the mock: adding `getInFlightRun` for rejoining a
// live run turned every test in the file into an unhandled error,
// while the assertions themselves still passed.
vi.mock('@/services/agent-rest', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/services/agent-rest')>()),
  getThreadState: vi.fn(() => new Promise(() => {})),
  getThreadStateAndInterrupt: vi.fn(() => new Promise(() => {})),
  getInFlightRun: vi.fn(async () => null),
}));

describe('_startRecoveryPolling — deadline fires independently of pending request', () => {
  let store: ReturnType<typeof makeStore>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    store = makeStore();
    seedChat(store);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sets isLoading=false after timeout even when getThreadStateAndInterrupt never resolves', () => {
    const intervalRef = { current: null } as React.MutableRefObject<ReturnType<typeof setInterval> | null>;
    const deadlineRef = { current: null } as React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    const wasInterruptedRef = { current: false };
    const onRecovered = vi.fn();

    _startRecoveryPolling(
      THREAD_ID,
      store.dispatch,
      onRecovered,
      intervalRef,
      deadlineRef,
      wasInterruptedRef,
      5000,
      RECOVERY_POLL_TIMEOUT_MS,
    );

    expect(intervalRef.current).not.toBeNull();
    expect(deadlineRef.current).not.toBeNull();

    // Advance past the deadline — the one-shot timeout must fire
    // even though the polling request is still pending
    vi.advanceTimersByTime(RECOVERY_POLL_TIMEOUT_MS + 1000);

    // Deadline should have cleaned up both timers
    expect(intervalRef.current).toBeNull();
    expect(deadlineRef.current).toBeNull();

    // Redux state should reflect the timeout
    const state = selectStreamingState(store.getState(), THREAD_ID);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Agent is unavailable. Please try again.');

    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('uses originalErrorMessage in the timeout error when provided', () => {
    const intervalRef = { current: null } as React.MutableRefObject<ReturnType<typeof setInterval> | null>;
    const deadlineRef = { current: null } as React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    const wasInterruptedRef = { current: false };
    const onRecovered = vi.fn();

    _startRecoveryPolling(
      THREAD_ID,
      store.dispatch,
      onRecovered,
      intervalRef,
      deadlineRef,
      wasInterruptedRef,
      5000,
      RECOVERY_POLL_TIMEOUT_MS,
      'Model configuration is invalid',
    );

    // Advance past the deadline
    vi.advanceTimersByTime(RECOVERY_POLL_TIMEOUT_MS + 1000);

    const state = selectStreamingState(store.getState(), THREAD_ID);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Model configuration is invalid');
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('stops polling immediately when getThreadStateAndInterrupt throws with .status', async () => {
    const { getThreadStateAndInterrupt } = await import('@/services/agent-rest');
    const mockedFn = vi.mocked(getThreadStateAndInterrupt);

    const serverError = new Error('Model not found');
    (serverError as any).status = 500;
    mockedFn.mockRejectedValueOnce(serverError);

    const intervalRef = { current: null } as React.MutableRefObject<ReturnType<typeof setInterval> | null>;
    const deadlineRef = { current: null } as React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    const wasInterruptedRef = { current: false };
    const onRecovered = vi.fn();

    _startRecoveryPolling(
      THREAD_ID,
      store.dispatch,
      onRecovered,
      intervalRef,
      deadlineRef,
      wasInterruptedRef,
      5000,
      RECOVERY_POLL_TIMEOUT_MS,
    );

    // Trigger the first poll and let the rejected promise settle
    await vi.advanceTimersByTimeAsync(5001);

    // Server error should have stopped polling immediately
    expect(intervalRef.current).toBeNull();

    const state = selectStreamingState(store.getState(), THREAD_ID);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBe('Model not found');
    expect(onRecovered).not.toHaveBeenCalled();
  });

  it('keeps polling when getThreadStateAndInterrupt throws with a recoverable status (503)', async () => {
    const { getThreadStateAndInterrupt } = await import('@/services/agent-rest');
    const mockedFn = vi.mocked(getThreadStateAndInterrupt);

    const transientError = new Error('Service Unavailable');
    (transientError as any).status = 503;
    mockedFn.mockRejectedValueOnce(transientError);

    const intervalRef = { current: null } as React.MutableRefObject<ReturnType<typeof setInterval> | null>;
    const deadlineRef = { current: null } as React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    const wasInterruptedRef = { current: false };
    const onRecovered = vi.fn();

    _startRecoveryPolling(
      THREAD_ID,
      store.dispatch,
      onRecovered,
      intervalRef,
      deadlineRef,
      wasInterruptedRef,
      5000,
      RECOVERY_POLL_TIMEOUT_MS,
    );

    // Trigger the first poll — 503 should NOT stop polling
    await vi.advanceTimersByTimeAsync(5001);

    // Interval should still be running
    expect(intervalRef.current).not.toBeNull();

    // State should NOT have been set to error
    const state = selectStreamingState(store.getState(), THREAD_ID);
    expect(state.error).toBeNull();
  });

  it('discards a pending result that resolves after the poller is cancelled', async () => {
    const { getThreadStateAndInterrupt } = await import('@/services/agent-rest');
    const mockedFn = vi.mocked(getThreadStateAndInterrupt);

    // Control when the request resolves
    let resolveRequest!: (v: { messages: Message[]; interrupt: null }) => void;
    mockedFn.mockImplementationOnce(() => new Promise((r) => { resolveRequest = r; }));

    const intervalRef = { current: null } as React.MutableRefObject<ReturnType<typeof setInterval> | null>;
    const deadlineRef = { current: null } as React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
    const wasInterruptedRef = { current: false };
    const onRecovered = vi.fn();

    _startRecoveryPolling(
      THREAD_ID,
      store.dispatch,
      onRecovered,
      intervalRef,
      deadlineRef,
      wasInterruptedRef,
      5000,
      RECOVERY_POLL_TIMEOUT_MS,
    );

    // Trigger the first poll
    vi.advanceTimersByTime(5000);

    // Simulate stop() — clear refs before the request resolves
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    if (deadlineRef.current) clearTimeout(deadlineRef.current);
    deadlineRef.current = null;

    // Now resolve the in-flight request — it should be discarded
    resolveRequest({
      messages: [{ type: 'ai', content: 'stale', id: 'stale-1' } as unknown as Message],
      interrupt: null,
    });
    await vi.runAllTimersAsync();

    // Stale result must not trigger onRecovered or dispatch state
    expect(onRecovered).not.toHaveBeenCalled();
  });
});
