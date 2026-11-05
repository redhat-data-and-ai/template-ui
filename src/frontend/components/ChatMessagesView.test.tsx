import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mcpMounts = vi.hoisted(() => ({ n: 0 }));

vi.mock('./McpAppHost', async () => {
  const React = await import('react');
  return {
    McpAppHostFromToolCall: () => {
      React.useEffect(() => {
        mcpMounts.n += 1;
      }, []);
      return React.createElement('div', { 'data-testid': 'mcp-app-host' });
    },
  };
});
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
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
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({ errorMessage: 'Model configuration is invalid' })}
        />
      </Provider>,
    );

    // showNoResponse has a 1500ms delay before rendering
    act(() => { vi.advanceTimersByTime(2000); });

    expect(screen.getByText('The agent encountered an error:')).toBeInTheDocument();
    expect(screen.getByText('Model configuration is invalid')).toBeInTheDocument();
  });

  it('shows generic fallback when errorMessage is not provided', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <ChatMessagesView {...makeBaseProps()} />
      </Provider>,
    );

    act(() => { vi.advanceTimersByTime(2000); });

    expect(
      screen.getByText("The agent didn\u0027t respond. This could be a temporary issue."),
    ).toBeInTheDocument();
  });

  it('shows generic fallback when errorMessage is null', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <ChatMessagesView {...makeBaseProps({ errorMessage: null })} />
      </Provider>,
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
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({
            messages: [HUMAN_MESSAGE, AI_MESSAGE],
            errorMessage: 'Model configuration is invalid',
          })}
        />
      </Provider>,
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
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({
            messages: [HUMAN_MESSAGE, AI_MESSAGE],
            isLoading: true,
            errorMessage: 'Some error',
          })}
        />
      </Provider>,
    );

    expect(screen.queryByText('The agent encountered an error:')).not.toBeInTheDocument();
  });

  it('does not render error block while loading', () => {
    const store = makeStore();
    render(
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({ isLoading: true, errorMessage: 'Some error' })}
        />
      </Provider>,
    );

    act(() => { vi.advanceTimersByTime(2000); });

    expect(screen.queryByText('The agent encountered an error:')).not.toBeInTheDocument();
    expect(screen.queryByText('Some error')).not.toBeInTheDocument();
  });
});

describe('ChatMessagesView — current question status row', () => {
  it('names the finished tool and says it is writing the answer', () => {
    const store = makeStore();
    const finished = {
      type: 'ai',
      content: 'I will ask the analyst.',
      id: 'msg-ai-1',
      tool_calls: [{ id: 'tc-1', name: 'task', args: {}, content: 'done' }],
    } as unknown as Message;

    render(
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({ messages: [HUMAN_MESSAGE, finished], isLoading: true })}
        />
      </Provider>,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('task');
    expect(status).toHaveTextContent('Synthesizing answer...');
    expect(screen.queryByRole('status', { name: 'Agent is thinking' })).not.toBeInTheDocument();
  });

  it('shows a running tool by its own name', () => {
    const store = makeStore();
    const running = {
      type: 'ai',
      content: 'I will ask the analyst.',
      id: 'msg-ai-1',
      tool_calls: [{ id: 'tc-1', name: 'execute_sql', args: {} }],
    } as unknown as Message;

    render(
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({ messages: [HUMAN_MESSAGE, running], isLoading: true })}
        />
      </Provider>,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('execute_sql');
    expect(status).not.toHaveTextContent('Synthesizing answer...');
  });

  it('keeps the finished tool on the status row after a later reply starts', () => {
    const store = makeStore();
    const finished = {
      type: 'ai',
      content: 'I will ask the analyst.',
      id: 'msg-ai-1',
      tool_calls: [{ id: 'tc-1', name: 'task', args: {}, content: 'done' }],
    } as unknown as Message;
    const next = {
      type: 'ai',
      content: '',
      thinking: 'Checking the result.',
      id: 'msg-ai-2',
      tool_calls: [],
    } as unknown as Message;

    render(
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({ messages: [HUMAN_MESSAGE, finished, next], isLoading: true })}
        />
      </Provider>,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('task');
    expect(status).toHaveTextContent('Synthesizing answer...');
  });

  it('does not reprint an earlier question when a follow-up is starting', () => {
    const store = makeStore();
    const earlier = {
      type: 'ai',
      content: 'Done.',
      id: 'msg-ai-1',
      tool_calls: [
        { id: 'tc-1', name: 'read_config_data', args: {}, content: 'ok' },
        { id: 'tc-2', name: 'get_sql', args: {}, content: 'select 1' },
      ],
    } as unknown as Message;
    const followUp = {
      type: 'human',
      content: 'What about the next one?',
      id: 'msg-human-2',
    } as unknown as Message;

    render(
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({ messages: [HUMAN_MESSAGE, earlier, followUp], isLoading: true })}
        />
      </Provider>,
    );

    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Thinking...');
    expect(status).not.toHaveTextContent('read_config_data');
    expect(status).not.toHaveTextContent('get_sql');
    expect(status).not.toHaveTextContent('Synthesizing answer...');
  });
});

describe('ChatMessagesView — MCP app stays mounted', () => {
  it('opens an MCP app on click and does not remount it when another tool arrives', async () => {
    mcpMounts.n = 0;
    const store = makeStore();
    const first = {
      type: 'ai',
      content: '',
      id: 'ai-1',
      tool_calls: [{
        id: 'tc-chart',
        name: 'show_chart',
        args: {},
        content: 'ok',
        mcpApp: { server: 'charts', resourceUri: 'ui://charts/app.html' },
      }],
    } as unknown as Message;
    const second = {
      type: 'ai',
      content: '',
      id: 'ai-2',
      tool_calls: [{ id: 'tc-next', name: 'search', args: {} }],
    } as unknown as Message;

    const { rerender } = render(
      <Provider store={store}>
        <ChatMessagesView {...makeBaseProps({ messages: [HUMAN_MESSAGE, first], isLoading: true })} />
      </Provider>,
    );

    expect(screen.getByText('Click to open UI')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-app-host')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /expand tool call: show_chart/i }));
    expect(screen.queryByText('Click to open UI')).not.toBeInTheDocument();
    expect(screen.getAllByTestId('mcp-app-host')).toHaveLength(1);
    const mountsAfterFirst = mcpMounts.n;

    rerender(
      <Provider store={store}>
        <ChatMessagesView
          {...makeBaseProps({ messages: [HUMAN_MESSAGE, first, second], isLoading: true })}
        />
      </Provider>,
    );

    expect(screen.getAllByTestId('mcp-app-host')).toHaveLength(1);
    expect(mcpMounts.n).toBe(mountsAfterFirst);
    expect(screen.getByRole('status')).toHaveTextContent('search');
  });
});

describe('ChatMessagesView — subagent mentions', () => {
  it('bolds and underlines names saved on the sent message', () => {
    const store = makeStore();
    const tagged = {
      type: 'human',
      content: '/analyst /docs hello',
      id: 'msg-human-tagged',
      additional_kwargs: { subagent_mentions: ['analyst'] },
    } as unknown as Message;

    render(
      <Provider store={store}>
        <ChatMessagesView {...makeBaseProps({ messages: [tagged] })} />
      </Provider>,
    );

    const marked = screen.getByText('/analyst');
    expect(marked.tagName).toBe('STRONG');
    expect(marked).toHaveClass('underline');
    expect(screen.getByText(/\/docs hello/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy message' })).toBeInTheDocument();
  });
});
