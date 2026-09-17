import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createRef } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { ChatMessagesView } from './ChatMessagesView';

const humanMessage = {
  id: 'msg-1',
  type: 'human',
  content: 'original prompt',
} as Message;

function renderView(
  onEditMessage: (messageIndex: number, newContent: string) => void | boolean | Promise<void | boolean>,
) {
  return render(
    <ChatMessagesView
      messages={[humanMessage]}
      isLoading={false}
      scrollAreaRef={createRef<HTMLDivElement>()}
      onSubmit={() => {}}
      onCancel={() => {}}
      liveActivityEvents={[]}
      historicalActivities={{}}
      chatId="chat-1"
      traceId={null}
      onEditMessage={onEditMessage}
    />,
  );
}

describe('ChatMessagesView — edit gate', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });
  it('keeps the editor open when onEditMessage returns false', async () => {
    const user = userEvent.setup();
    const onEditMessage = vi.fn().mockResolvedValue(false);
    renderView(onEditMessage);

    await user.click(screen.getByRole('button', { name: /edit message/i }));
    const editor = screen.getByRole('textbox', { name: /edit message/i });
    await user.clear(editor);
    await user.type(editor, 'revised prompt');
    await user.click(screen.getByRole('button', { name: /save edited message/i }));

    await waitFor(() => {
      expect(onEditMessage).toHaveBeenCalledWith(0, 'revised prompt');
    });
    expect(screen.getByRole('textbox', { name: /edit message/i })).toHaveValue('revised prompt');
  });

  it('closes the editor when onEditMessage succeeds', async () => {
    const user = userEvent.setup();
    const onEditMessage = vi.fn().mockResolvedValue(true);
    renderView(onEditMessage);

    await user.click(screen.getByRole('button', { name: /edit message/i }));
    await user.click(screen.getByRole('button', { name: /save edited message/i }));

    await waitFor(() => {
      expect(screen.queryByRole('textbox', { name: /edit message/i })).not.toBeInTheDocument();
    });
  });
});
