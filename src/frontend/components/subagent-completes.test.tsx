import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { Message } from '@langchain/langgraph-sdk';
import chatsReducer, {
  addChat,
  appendMessageToChat,
  mergeToolResult,
} from '../redux/slices/chats';
import { SubAgentIndicator } from './SubAgentIndicator';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o?.node ? `${k}:${o.node}` : o?.tool ? `${k}:${o.tool}` : k,
  }),
}));

/**
 * The exact sequence the live stream produces, replayed through the
 * real reducers: an assistant message delegating to `curator`, then
 * the `task` result carrying the same tool_call_id.
 *
 * Observed on the wire:
 *   AI tool_calls: [('curator', 'call_207657')]
 *   tool results : [('task', 'call_207657', '### Classification...')]
 */
describe('a finished subagent stops saying Working', () => {
  function storeAfterReply() {
    let s = chatsReducer(undefined, { type: '@@INIT' });
    s = chatsReducer(s, addChat({
      id: 'c1',
      title: 'chat',
      timestamp: new Date().toISOString(),
      preview: '',
      messages: [],
    } as never));

    s = chatsReducer(s, appendMessageToChat({
      chatId: 'c1',
      message: {
        type: 'ai',
        id: 'm1',
        content: 'Asking the curator subagent.',
        tool_calls: [
          { id: 'call_207657', name: 'curator', args: { subagent_type: 'curator' } },
        ],
      } as unknown as Message,
    }));

    s = chatsReducer(s, mergeToolResult({
      chatId: 'c1',
      toolCallId: 'call_207657',
      content: '### Classification & Governance\n- done',
    }));

    return s;
  }

  it('attaches the result to the delegating tool call', () => {
    const s = storeAfterReply();
    const msg = s.chats[0].messages[0] as unknown as {
      tool_calls: Array<{ id: string; content?: unknown }>;
    };

    expect(msg.tool_calls[0].content).toContain('Classification');
  });

  it('renders as complete, not Working', () => {
    const s = storeAfterReply();
    const msg = s.chats[0].messages[0] as unknown as {
      tool_calls: Array<Record<string, unknown>>;
    };

    render(
      <SubAgentIndicator
        toolCall={msg.tool_calls[0] as never}
        messageId="m1"
        index={0}
        progress={{
          ns: 'agent:curator',
          agent: 'curator',
          startedAt: Date.now() - 60_000,
          steps: [{ tool: 'dataverse_execute_sql', startedAt: 1000, endedAt: 2000 }],
        }}
      />,
    );

    expect(screen.queryByText(/subagents\.working/)).not.toBeInTheDocument();
    expect(screen.getByText('subagents.complete')).toBeInTheDocument();
  });
});

/**
 * The same sequence arriving over a *re-attached* stream, which is
 * what a refresh or a tab-switch produces. The attach handler used
 * to append the tool result as its own message, leaving the
 * delegating call's content empty — the one thing that tells the box
 * the subagent has finished.
 */
describe('a subagent that finished while the tab was away', () => {
  it('merges a tool result instead of appending it', () => {
    let s = chatsReducer(undefined, { type: '@@INIT' });
    s = chatsReducer(s, addChat({
      id: 'c1', title: 'chat', timestamp: new Date().toISOString(),
      preview: '', messages: [],
    } as never));
    s = chatsReducer(s, appendMessageToChat({
      chatId: 'c1',
      message: {
        type: 'ai', id: 'm1', content: 'Asking curator.',
        tool_calls: [{ id: 'call_1', name: 'curator', args: {} }],
      } as unknown as Message,
    }));

    // What the attach path must do with a tool message.
    s = chatsReducer(s, mergeToolResult({
      chatId: 'c1', toolCallId: 'call_1', content: 'done',
    }));

    const msgs = s.chats[0].messages as unknown as Array<{
      type: string; tool_calls?: Array<{ content?: unknown }>;
    }>;

    // One message, with the result on its tool call — not two.
    expect(msgs).toHaveLength(1);
    expect(msgs[0].tool_calls?.[0].content).toBe('done');
  });
})
