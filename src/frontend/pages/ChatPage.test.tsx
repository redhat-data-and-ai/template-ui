import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestStore } from '../test-utils/createTestStore';
import { addChat, setLoadingThreads, updateChat, updateStreamingState } from '../redux/slices/chats';
import { getThreadStateAndInterrupt } from '../services/agent-rest';
import { getThreadFeedback } from '../services/feedback-api';
import { getStreamingManager, releaseAllStreamingManagers } from '../lib/streaming/streamingManagerRegistry';
import { useStreamingAPI } from '../hooks/useStreamingAPI';
import { ChatPage } from './ChatPage';

vi.mock('../hooks/useStreamingAPI', () => ({ useStreamingAPI: vi.fn(), MAX_RETRIES: 3 }));
const health = vi.hoisted(() => ({ status: 'healthy' }));
vi.mock('../hooks/useAgentHealth', () => ({ useAgentHealth: () => health }));
vi.mock('../services/agent-rest', () => ({ getThreadStateAndInterrupt: vi.fn() }));
vi.mock('../services/feedback-api', () => ({ getThreadFeedback: vi.fn(async () => ({})) }));
vi.mock('../components/ChatMessagesView', () => ({ ChatMessagesView: () => <div>Messages</div> }));

const messages = [{ type: 'human', id: 'h1', content: 'Original request' }] as any;
const newer = [{ type: 'ai', id: 'new', content: 'Resume completed' }] as any;

function setup() {
  const store = createTestStore();
  store.dispatch(addChat({ id: 'hydration-thread', title: 'Test', timestamp: new Date().toISOString(), preview: '', messages, historicalActivities: {}, feedback: {} }));
  store.dispatch(setLoadingThreads(false));
  let resolveOld!: (value: any) => void;
  vi.mocked(getThreadStateAndInterrupt).mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  vi.mocked(getThreadStateAndInterrupt).mockResolvedValue({ messages: newer, interrupt: null, interrupts: [] });
  const thread = {
    messages, pendingInterrupt: null, pendingInterrupts: [], isLoading: false, isResuming: false,
    setMessages: vi.fn(), mcpEvents: [], streamEvents: [], checkAndAutoApprove: vi.fn(),
    resumeWithDecisions: vi.fn(), resumeInterrupt: vi.fn(), refreshInterrupts: vi.fn(),
    stop: vi.fn(), taskSteps: [],
  };
  vi.mocked(useStreamingAPI).mockImplementation(() => thread as any);
  const ui = () => <Provider store={store}><MemoryRouter><ChatPage threadId="hydration-thread" /></MemoryRouter></Provider>;
  const view = render(ui());
  const old = { messages, interrupt: { id: 'consumed', value: 'Approve old action', resumable: true }, interrupts: [{ id: 'consumed', value: 'Approve old action', resumable: true }] };
  return { store, thread, ui, view, resolveOld, old };
}

describe('ChatPage hydration ordering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    health.status = 'healthy';
    releaseAllStreamingManagers();
    localStorage.clear();
  });

  it.each(['isLoading', 'isResuming'] as const)('cancels old hydration when %s starts', async flag => {
    const { store, thread, ui, view, resolveOld, old } = setup();
    await waitFor(() => expect(getThreadStateAndInterrupt).toHaveBeenCalledTimes(1));
    thread[flag] = true;
    view.rerender(ui());
    act(() => { store.dispatch(updateChat({ id: 'hydration-thread', updates: { messages: newer } })); });
    thread[flag] = false;
    view.rerender(ui());
    await waitFor(() => expect(getThreadStateAndInterrupt).toHaveBeenCalledTimes(2));
    await act(async () => { resolveOld(old); });
    expect(store.getState().chats.chats[0].messages).toEqual(newer);
    expect(store.getState().chats.streamingStates['hydration-thread']?.pendingInterrupts).toEqual([]);
    view.unmount();
  });

  it('discards hydration after a complete resume even when busy transitions were batched', async () => {
    const { store, view, resolveOld, old } = setup();
    const manager = getStreamingManager('hydration-thread');
    act(() => {
      manager.beginResume(); manager.endResume(false);
      store.dispatch(updateChat({ id: 'hydration-thread', updates: { messages: newer } }));
    });
    await act(async () => { resolveOld(old); });
    expect(store.getState().chats.chats[0].messages).toEqual(newer);
    expect(store.getState().chats.streamingStates['hydration-thread']?.pendingInterrupt).toBeUndefined();
    view.unmount();
  });

  it('restores pending approvals even when feedback retrieval fails', async () => {
    vi.mocked(getThreadFeedback).mockRejectedValueOnce(new TypeError('Network unavailable'));
    const { store, view, resolveOld, old } = setup();
    await act(async () => { resolveOld(old); });
    expect(store.getState().chats.streamingStates['hydration-thread']?.pendingInterrupts).toEqual(old.interrupts);
    view.unmount();
  });

  it('allows approvals after hydration recovers a failed fallback refresh', async () => {
    const manager = getStreamingManager('hydration-thread');
    manager.beginResume();
    manager.endResume(true);
    expect(() => manager.beginResume()).toThrow('Refresh pending approvals');
    const { view, resolveOld, old } = setup();
    await act(async () => { resolveOld(old); });
    expect(() => manager.beginResume()).not.toThrow();
    manager.endResume(false);
    view.unmount();
  });

  it('discards a health-recovery snapshot that overlaps a complete resume', async () => {
    const { store, ui, view, resolveOld, old } = setup();
    await act(async () => { resolveOld(old); });
    let resolveRecovery!: (value: any) => void;
    vi.mocked(getThreadStateAndInterrupt).mockImplementationOnce(
      () => new Promise(resolve => { resolveRecovery = resolve; }),
    );
    vi.useFakeTimers();
    try {
      health.status = 'unhealthy';
      view.rerender(ui());
      health.status = 'healthy';
      view.rerender(ui());
      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(getThreadStateAndInterrupt).toHaveBeenCalledTimes(2);
      const manager = getStreamingManager('hydration-thread');
      act(() => {
        manager.beginResume();
        manager.endResume(false);
        store.dispatch(updateChat({ id: 'hydration-thread', updates: { messages: newer } }));
        store.dispatch(updateStreamingState({ chatId: 'hydration-thread', state: { pendingInterrupts: [] } }));
      });
      await act(async () => { resolveRecovery(old); });
      expect(store.getState().chats.chats[0].messages).toEqual(newer);
      expect(store.getState().chats.streamingStates['hydration-thread']?.pendingInterrupts).toEqual([]);
    } finally {
      view.unmount();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });
});
