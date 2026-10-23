import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Provider } from 'react-redux';
// ForkButton calls useNavigate, so the view needs a router in scope.
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import type { Message } from '@langchain/langgraph-sdk';
import { ChatMessagesView } from './ChatMessagesView';
import chatsReducer from '../redux/slices/chats';
import configReducer from '../redux/slices/config';
import personalizationReducer from '../redux/slices/personalization';
import toastsReducer from '../redux/slices/toasts';
import userSettingsReducer from '../redux/slices/userSettings';
import projectsReducer from '../redux/slices/projects';

// jsdom does not implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

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

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HUMAN_MESSAGE = {
  type: 'human',
  content: 'Hello agent',
  id: 'msg-human-1',
} as unknown as Message;

function makeBaseProps(overrides: Record<string, unknown> = {}) {
  return {
    messages: [HUMAN_MESSAGE],
    isLoading: false,
    pendingInterrupt: undefined as any,
    scrollAreaRef: React.createRef<HTMLDivElement>(),
    onSubmit: vi.fn(),
    onCancel: vi.fn(),
    liveActivityEvents: [] as any[],
    historicalActivities: {} as Record<string, any[]>,
    chatId: 'test-chat',
    traceId: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ChatMessagesView — errorMessage prop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders actual error text when errorMessage is provided', () => {
    const store = makeStore();
    render(
      <MemoryRouter>
        <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({ errorMessage: 'Model configuration is invalid' })}
        />
        </Provider>
      </MemoryRouter>,
    );

    // showNoResponse has a 1500ms delay before rendering
    act(() => { vi.advanceTimersByTime(2000); });

    expect(screen.getByText('The agent encountered an error:')).toBeInTheDocument();
    expect(screen.getByText('Model configuration is invalid')).toBeInTheDocument();
  });

  it('shows generic fallback when errorMessage is not provided', () => {
    const store = makeStore();
    render(
      <MemoryRouter>
        <Provider store={store}>
        <ChatMessagesView {...makeBaseProps()} />
        </Provider>
      </MemoryRouter>,
    );

    act(() => { vi.advanceTimersByTime(2000); });

    expect(
      screen.getByText("The agent didn\u0027t respond. This could be a temporary issue."),
    ).toBeInTheDocument();
  });

  it('shows generic fallback when errorMessage is null', () => {
    const store = makeStore();
    render(
      <MemoryRouter>
        <Provider store={store}>
        <ChatMessagesView {...makeBaseProps({ errorMessage: null })} />
        </Provider>
      </MemoryRouter>,
    );

    act(() => { vi.advanceTimersByTime(2000); });

    expect(
      screen.getByText("The agent didn\u0027t respond. This could be a temporary issue."),
    ).toBeInTheDocument();
  });

  it('renders error when last message is AI (partial response before error)', () => {
    const store = makeStore();
    const AI_MESSAGE = {
      type: 'ai',
      content: 'Partial response...',
      id: 'msg-ai-1',
      tool_calls: [],
    } as unknown as Message;

    render(
      <MemoryRouter>
        <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({
            messages: [HUMAN_MESSAGE, AI_MESSAGE],
            errorMessage: 'Model configuration is invalid',
          })}
        />
        </Provider>
      </MemoryRouter>,
    );

    // No delay needed — the standalone error block renders immediately
    expect(screen.getByText('The agent encountered an error:')).toBeInTheDocument();
    expect(screen.getByText('Model configuration is invalid')).toBeInTheDocument();
  });

  it('does not render standalone error block while loading', () => {
    const store = makeStore();
    const AI_MESSAGE = {
      type: 'ai',
      content: 'Partial response...',
      id: 'msg-ai-2',
      tool_calls: [],
    } as unknown as Message;

    render(
      <MemoryRouter>
        <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({
            messages: [HUMAN_MESSAGE, AI_MESSAGE],
            isLoading: true,
            errorMessage: 'Some error',
          })}
        />
        </Provider>
      </MemoryRouter>,
    );

    expect(screen.queryByText('The agent encountered an error:')).not.toBeInTheDocument();
  });

  it('does not render error block while loading', () => {
    const store = makeStore();
    render(
      <MemoryRouter>
        <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({ isLoading: true, errorMessage: 'Some error' })}
        />
        </Provider>
      </MemoryRouter>,
    );

    act(() => { vi.advanceTimersByTime(2000); });

    expect(screen.queryByText('The agent encountered an error:')).not.toBeInTheDocument();
    expect(screen.queryByText('Some error')).not.toBeInTheDocument();
  });
});

describe('actions row on delegation messages', () => {
  /**
   * A turn that delegates produces two assistant messages: one whose
   * only payload is `task` tool calls, and one with the answer. Both
   * used to get a full actions row, so a single turn showed two
   * "AI-generated" tags and offered a thumbs-up on a message that
   * said nothing but "I called two subagents".
   */
  const delegation = {
    id: 'ai-delegation',
    type: 'ai',
    content: '',
    tool_calls: [
      { name: 'task', id: 'c1', args: { subagent_type: 'investigator', description: 'Find MRs' } },
    ],
  } as unknown as Message;

  const answer = {
    id: 'ai-answer',
    type: 'ai',
    content: 'Here are your 20 open merge requests.',
  } as unknown as Message;

  const renderWith = (messages: Message[]) =>
    render(
      <MemoryRouter>
        <Provider store={makeStore()}>
          <ChatMessagesView {...makeBaseProps({ messages })} />
        </Provider>
      </MemoryRouter>,
    );

  it('marks the answer as AI-generated exactly once in a delegated turn', () => {
    renderWith([HUMAN_MESSAGE, delegation, answer]);
    // Exact text: the badge's own aria-label is "AI-generated
    // content", which a loose matcher also catches.
    expect(screen.getAllByText('AI-generated')).toHaveLength(1);
  });

  it('still marks a plain answer', () => {
    renderWith([HUMAN_MESSAGE, answer]);
    expect(screen.getAllByText('AI-generated')).toHaveLength(1);
  });
});

describe('ChatMessagesView — delegation intent', () => {
  it('renders the text the agent wrote above its subagent boxes', () => {
    const store = makeStore();
    const delegating = {
      type: 'ai',
      id: 'msg-ai-1',
      content: 'Checking GitLab with investigator for your open merge requests.',
      tool_calls: [
        { id: 'tc-1', name: 'task', args: { subagent_type: 'investigator', description: 'find MRs' } },
        { id: 'tc-2', name: 'task', args: { subagent_type: 'workspace', description: 'find issues' } },
      ],
    } as unknown as Message;

    render(
      <MemoryRouter>
        <Provider store={store}>
          <ChatMessagesView {...makeBaseProps({ messages: [HUMAN_MESSAGE, delegating] })} />
        </Provider>
      </MemoryRouter>,
    );

    const intent = screen.getByTestId('delegation-intent');
    expect(intent).toHaveTextContent('Checking GitLab with investigator');
  });

  it('renders no intent block when the agent delegated without saying anything', () => {
    const store = makeStore();
    const silent = {
      type: 'ai',
      id: 'msg-ai-2',
      content: '',
      tool_calls: [{ id: 'tc-3', name: 'task', args: { subagent_type: 'investigator' } }],
    } as unknown as Message;

    render(
      <MemoryRouter>
        <Provider store={store}>
          <ChatMessagesView {...makeBaseProps({ messages: [HUMAN_MESSAGE, silent] })} />
        </Provider>
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('delegation-intent')).not.toBeInTheDocument();
  });
});
