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
