import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import type { Message } from '@langchain/langgraph-sdk';
import { ChatMessagesView } from './ChatMessagesView';
import { createTestStore } from '../test-utils/createTestStore';

Element.prototype.scrollIntoView = vi.fn();

const QUESTION = 'Using dataverse, what was Q4 ARR?';

/**
 * A system that authorizes itself part-way through a turn cannot be
 * queried until the next one, so the interface retries. The marker
 * saying so arrives on the *tool result*, which is merged onto the
 * originating call rather than appended as a message — reading
 * `message.content` alone never saw it, and the retry had never
 * fired. The user was left reading "please prompt me once more".
 */
function messagesWithMarker(): Message[] {
  return [
    { type: 'human', content: QUESTION, id: 'h1' },
    {
      type: 'ai',
      id: 'a1',
      content: 'Dataverse has just been connected; fetching the answer.',
      tool_calls: [
        {
          id: 'tc1',
          name: 'mcp__dataverse',
          args: {},
          content: '[TOOLS_RELOADED mcp=dataverse] dataverse is now authorized',
        },
      ],
    },
  ] as unknown as Message[];
}

function renderView(messages: Message[], onSubmit: () => void) {
  return render(
    <MemoryRouter>
      <Provider store={createTestStore()}>
        <ChatMessagesView
          messages={messages}
          isLoading={false}
          pendingInterrupt={undefined as never}
          scrollAreaRef={React.createRef<HTMLDivElement>()}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
          liveActivityEvents={[]}
          historicalActivities={{}}
          chatId="c1"
          traceId={null}
        />
      </Provider>
    </MemoryRouter>,
  );
}

describe('a system that connected mid-turn is retried for the user', () => {
  it('finds the marker on the tool result, not just the message text', async () => {
    const onSubmit = vi.fn();
    renderView(messagesWithMarker(), onSubmit);

    // Silent: the agent needs the question, the transcript does not
    // need it twice.
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(QUESTION, { silent: true }),
    );
  });

  it('retries once, not on every render', async () => {
    const onSubmit = vi.fn();
    const { rerender } = renderView(messagesWithMarker(), onSubmit);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    rerender(
      <MemoryRouter>
        <Provider store={createTestStore()}>
          <ChatMessagesView
            messages={messagesWithMarker()}
            isLoading={false}
            pendingInterrupt={undefined as never}
            scrollAreaRef={React.createRef<HTMLDivElement>()}
            onSubmit={onSubmit}
            onCancel={vi.fn()}
            liveActivityEvents={[]}
            historicalActivities={{}}
            chatId="c1"
            traceId={null}
          />
        </Provider>
      </MemoryRouter>,
    );
    await new Promise((r) => setTimeout(r, 40));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('does not retry an ordinary answer', async () => {
    const onSubmit = vi.fn();
    renderView(
      [
        { type: 'human', content: QUESTION, id: 'h1' },
        { type: 'ai', id: 'a1', content: 'Q4 ARR was $6.7B.', tool_calls: [] },
      ] as unknown as Message[],
      onSubmit,
    );

    await new Promise((r) => setTimeout(r, 40));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('hides the marker from the reader', async () => {
    renderView(messagesWithMarker(), vi.fn());
    expect(screen.queryByText(/TOOLS_RELOADED/)).not.toBeInTheDocument();
  });

  it('does not show a silently retried question in the transcript', () => {
    renderView(
      [
        { type: 'human', content: QUESTION, id: 'h1' },
        {
          type: 'human',
          content: QUESTION,
          id: 'h2',
          additional_kwargs: { silent_retry: true },
        },
        { type: 'ai', id: 'a2', content: 'Q4 ARR was $6.7B.', tool_calls: [] },
      ] as unknown as Message[],
      vi.fn(),
    );

    // Asked once, shown once.
    expect(screen.getAllByText(QUESTION)).toHaveLength(1);
  });
});
