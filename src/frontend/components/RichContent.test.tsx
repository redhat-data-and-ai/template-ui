import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { Message } from '@langchain/langgraph-sdk';
import { AIMessageRenderer } from './ChatMessagesView';
import { ArtifactViewer } from './ArtifactViewer';
import { ReconnectingBanner } from './ReconnectingBanner';
import { ToastNotifications } from './ToastNotifications';
import { McpStatusPanel } from './McpStatusPanel';
import { FeedbackButtons, useFeedback } from './FeedbackButtons';
import { getToolIcon } from '../lib/toolIcons';
import toastsReducer, { addToast } from '../redux/slices/toasts';
import chatsReducer from '../redux/slices/chats';

vi.mock('./McpAppHost', () => ({
  McpAppHostFromToolCall: () => <div data-testid="mcp-app-host" />,
}));

function aiMsg(content: string): Message {
  return { type: 'ai', id: 'm1', content, tool_calls: [] } as unknown as Message;
}

describe('markdown + code blocks', () => {
  it('renders headings, lists, tables, inline code and links by role', () => {
    const md = [
      '# Title',
      '',
      '## Sub',
      '',
      '- one',
      '- two',
      '',
      '1. first',
      '',
      'Use `npm test` and [docs](https://example.com/docs).',
      '',
      '| a | b |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n');
    render(<AIMessageRenderer message={aiMsg(md)} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Sub' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('npm test')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /docs/ })).toHaveAttribute('href', 'https://example.com/docs');
  });

  it('code block shows its text and a copy button that copies and confirms', async () => {
    const user = userEvent.setup();
    render(<AIMessageRenderer message={aiMsg('```js\nconst a = 1;\n```')} />);
    expect(screen.getByText('const a = 1;')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy code' }));
    expect(await navigator.clipboard.readText()).toBe('const a = 1;\n');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
  });
});

describe('ArtifactViewer', () => {
  it('shows title, kind label and a copy button', async () => {
    const user = userEvent.setup();
    const json = JSON.stringify({ key: 'value' });
    render(<ArtifactViewer content={json} title="result.json" />);
    expect(screen.getByText('result.json')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy content' }));
    expect(await navigator.clipboard.readText()).toBe(json);
  });
});

describe('banners, toasts, MCP status', () => {
  it('ReconnectingBanner announces the attempt', () => {
    render(
      <ReconnectingBanner
        maxRetries={5}
        streamingState={{ isReconnecting: true, reconnectAttempt: 2, streamDroppedMidResponse: false } as never}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting...');
    expect(screen.getByRole('status')).toHaveTextContent('Attempt 2/5');
  });

  it('ToastNotifications renders a toast with a dismiss button', () => {
    const store = configureStore({ reducer: { toasts: toastsReducer } });
    render(
      <Provider store={store}>
        <ToastNotifications />
      </Provider>,
    );
    act(() => {
      store.dispatch(addToast({ title: 'Saved', message: 'All good', variant: 'success' }));
    });
    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(screen.getByText('All good')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
  });

  it('McpStatusPanel lists tools with status', () => {
    render(<McpStatusPanel mcpEvents={[{ tool: 'search', status: 'success', timestamp: 1 }]} />);
    expect(screen.getByRole('region', { name: 'MCP tool status' })).toBeInTheDocument();
    expect(screen.getByText('search')).toBeInTheDocument();
    expect(screen.getByText('success')).toBeInTheDocument();
  });
});

describe('FeedbackButtons', () => {
  function Harness({ existing }: { existing: 'up' | 'down' | null }) {
    const fb = useFeedback({ messageId: 'm', traceId: 't', chatId: 'c', existingFeedback: existing });
    return <FeedbackButtons fb={fb} />;
  }
  it('exposes rating buttons with pressed state', () => {
    const store = configureStore({ reducer: { chats: chatsReducer, toasts: toastsReducer } });
    render(
      <Provider store={store}>
        <Harness existing="up" />
      </Provider>,
    );
    expect(screen.getByRole('button', { name: 'Rate response as helpful' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Rate response as not helpful' })).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('getToolIcon', () => {
  it('maps known tools to distinct icons and falls back to a default', () => {
    expect(getToolIcon('ls')).not.toBe(getToolIcon('execute'));
    expect(getToolIcon('read_file')).not.toBe(getToolIcon('ls'));
    expect(getToolIcon('something_else')).toBe(getToolIcon('another_unknown'));
    const Icon = getToolIcon('ls');
    const { container } = render(<Icon />);
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
