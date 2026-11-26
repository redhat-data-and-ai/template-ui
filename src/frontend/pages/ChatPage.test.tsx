import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestStore } from '../test-utils/createTestStore';
import { addChat, setLoadingThreads, updateChat, updateStreamingState } from '../redux/slices/chats';
import { getSubagentTranscripts, getThreadStateAndInterrupt } from '../services/agent-rest';
import { getThreadFeedback } from '../services/feedback-api';
import { getStreamingManager, releaseAllStreamingManagers } from '../lib/streaming/streamingManagerRegistry';
import { useStreamingAPI } from '../hooks/useStreamingAPI';
import { ChatPage } from './ChatPage';

vi.mock('../hooks/useStreamingAPI', () => ({ useStreamingAPI: vi.fn(), MAX_RETRIES: 3 }));
const health = vi.hoisted(() => ({ status: 'healthy' }));
vi.mock('../hooks/useAgentHealth', () => ({ useAgentHealth: () => health }));
vi.mock('../services/agent-rest', () => ({
  getThreadStateAndInterrupt: vi.fn(),
  getSubagentTranscripts: vi.fn(async () => []),
}));
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
    stop: vi.fn(), taskSteps: [], attachLiveRun: vi.fn(),
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

  it('keeps a subagent stream already on screen when the chat loads again', async () => {
    const transcript = [{ id: 'sub-1', tool_calls: [{ id: 'lookup-1', name: 'lookup_records', args: { query: 'example' } }] }];
    const local = [{
      type: 'ai', id: 'parent', content: '',
      tool_calls: [{ id: 'task', name: 'task', args: { subagent_type: 'researcher' }, transcript }],
    }];
    const server = [{
      type: 'ai', id: 'parent', content: '',
      tool_calls: [{ id: 'task', name: 'task', args: { subagent_type: 'researcher' } }],
    }];
    const store = createTestStore();
    store.dispatch(addChat({
      id: 'hydration-thread', title: 'Test', timestamp: new Date().toISOString(),
      preview: '', messages: local as any, historicalActivities: {}, feedback: {},
    }));
    store.dispatch(setLoadingThreads(false));
    vi.mocked(getThreadStateAndInterrupt).mockResolvedValue({ messages: server as any, interrupt: null, interrupts: [] });
    vi.mocked(getSubagentTranscripts).mockResolvedValue([]);
    vi.mocked(useStreamingAPI).mockImplementation(() => ({
      messages: local, pendingInterrupt: null, pendingInterrupts: [], isLoading: false, isResuming: false,
      setMessages: vi.fn(), mcpEvents: [], streamEvents: [], checkAndAutoApprove: vi.fn(),
      resumeWithDecisions: vi.fn(), resumeInterrupt: vi.fn(), refreshInterrupts: vi.fn(),
      stop: vi.fn(), taskSteps: [], attachLiveRun: vi.fn(),
    }) as any);
    const view = render(
      <Provider store={store}><MemoryRouter><ChatPage threadId="hydration-thread" /></MemoryRouter></Provider>,
    );
    await waitFor(() => {
      const call = (store.getState().chats.chats[0].messages[0] as any).tool_calls[0];
      expect(call.transcript).toEqual(transcript);
    });
    view.unmount();
  });

  it('approves an always-allowed tool while the parent run is still busy', async () => {
    const resumeWithDecisions = vi.fn().mockResolvedValue(undefined);
    const interrupt = {
      id: 'inner', resumable: true,
      value: { action_requests: [{ name: 'execute_sql', args: { sql: 'select 1' } }], review_configs: [] },
    };
    const store = createTestStore();
    store.dispatch(addChat({
      id: 'hydration-thread', title: 'Test', timestamp: new Date().toISOString(),
      preview: '', messages, historicalActivities: {}, feedback: {},
    }));
    store.dispatch(setLoadingThreads(false));
    const manager = getStreamingManager('hydration-thread');
    vi.spyOn(manager, 'getStatus').mockReturnValue('streaming');
    const cancel = vi.spyOn(manager, 'cancel');
    vi.mocked(useStreamingAPI).mockImplementation(() => ({
      messages, pendingInterrupt: interrupt, pendingInterrupts: [interrupt], isLoading: false, isResuming: false,
      setMessages: vi.fn(), mcpEvents: [], streamEvents: [],
      checkAndAutoApprove: () => ({ allAutoApproved: true, decisions: [{ type: 'approve' }] }),
      resumeWithDecisions, resumeInterrupt: vi.fn(), refreshInterrupts: vi.fn(),
      stop: vi.fn(), taskSteps: [], attachLiveRun: vi.fn(),
    }) as any);
    const view = render(
      <Provider store={store}><MemoryRouter><ChatPage threadId="hydration-thread" /></MemoryRouter></Provider>,
    );
    await waitFor(() => expect(resumeWithDecisions).toHaveBeenCalledWith([{ type: 'approve' }], 'inner'));
    expect(cancel).toHaveBeenCalled();
    expect(cancel.mock.invocationCallOrder[0]).toBeLessThan(resumeWithDecisions.mock.invocationCallOrder[0]);
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
