import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestStore } from '../test-utils/createTestStore';
import { addChat, setLoadingThreads, updateChat } from '../redux/slices/chats';
import { getThreadStateAndInterrupt } from '../services/agent-rest';
import { getStreamingManager, releaseAllStreamingManagers } from '../lib/streaming/streamingManagerRegistry';
import { useStreamingAPI } from '../hooks/useStreamingAPI';
import { ChatPage } from './ChatPage';

vi.mock('../hooks/useStreamingAPI', () => ({ useStreamingAPI: vi.fn(), MAX_RETRIES: 3 }));
vi.mock('../hooks/useAgentHealth', () => ({ useAgentHealth: () => ({ status: 'healthy' }) }));
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
});
