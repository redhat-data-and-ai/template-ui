import { describe, it, expect } from 'vitest';
import type { Message } from '@langchain/langgraph-sdk';
import chatsReducer, {
  addChat,
  appendMessageToChat,
  clearAllChats,
  deleteChat,
  mergeToolResult,
  resolveAllPendingToolCalls,
  selectChatsByProject,
  setChats,
  setMessageFeedback,
  updateChat,
  updateLastMessageInChat,
  updateStreamingState,
  type ChatsState,
  type ChatItem,
} from './chats';
import { assignThreadToProjectThunk, deleteProjectThunk, unassignAllThreadsThunk } from './projects';

/** Minimal fixture shape that matches the runtime duck-type expected by chats slice reducers. */
type TestToolCall = { id: string; name: string; args: Record<string, unknown>; content?: string };
type TestMessage = {
  type: 'ai' | 'human';
  content: string;
  id: string;
  tool_calls?: TestToolCall[];
};
/** Cast a TestMessage fixture to the LangGraph Message type used by the chats slice. */
function asMsg(m: TestMessage): Message {
  return m as unknown as Message;
}

// ── Factory helpers ───────────────────────────────────────────────────────────

function makeChat(id: string, overrides: Partial<ChatItem> = {}): ChatItem {
  return {
    id,
    title: `Chat ${id}`,
    timestamp: new Date().toISOString(),
    preview: '',
    messages: [],
    historicalActivities: {},
    feedback: {},
    ...overrides,
  };
}

function initialState(): ChatsState {
  return chatsReducer(undefined, { type: '@@INIT' });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('chats slice — addChat', () => {
  it('adds a chat to the front of the list', () => {
    const chat = makeChat('c1');
    const s = chatsReducer(initialState(), addChat(chat));
    expect(s.chats[0].id).toBe('c1');
  });
});

describe('chats slice — updateChat', () => {
  it('updates fields on a matching chat', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    s = chatsReducer(s, updateChat({ id: 'c1', updates: { title: 'New Title' } }));
    expect(s.chats[0].title).toBe('New Title');
  });

  it('is a no-op when the chat id is not found', () => {
    const base = chatsReducer(initialState(), addChat(makeChat('c1')));
    const s = chatsReducer(base, updateChat({ id: 'nonexistent', updates: { title: 'X' } }));
    expect(s.chats[0].title).toBe('Chat c1');
  });
});

describe('chats slice — deleteChat', () => {
  it('removes the chat from the list', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    s = chatsReducer(s, deleteChat('c1'));
    expect(s.chats).toHaveLength(0);
  });
});

describe('chats slice — clearAllChats', () => {
  it('empties the chats list and clears streamingStates', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    s = chatsReducer(s, clearAllChats());
    expect(s.chats).toHaveLength(0);
    expect(s.streamingStates).toEqual({});
  });
});

describe('chats slice — appendMessageToChat', () => {
  it('appends a message to the correct chat', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    const msg: TestMessage = { type: 'ai', content: 'Hello', tool_calls: [], id: 'msg-1' };
    s = chatsReducer(s, appendMessageToChat({ chatId: 'c1', message: asMsg(msg) }));
    expect(s.chats[0].messages).toHaveLength(1);
    expect((s.chats[0].messages[0] as TestMessage).id).toBe('msg-1');
  });

  it('is idempotent when the same message id is appended twice', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    const msg: TestMessage = { type: 'ai', content: 'Hello', tool_calls: [], id: 'msg-1' };
    s = chatsReducer(s, appendMessageToChat({ chatId: 'c1', message: asMsg(msg) }));
    s = chatsReducer(s, appendMessageToChat({ chatId: 'c1', message: asMsg(msg) }));
    expect(s.chats[0].messages).toHaveLength(1);
  });

  it('is a no-op when the chat does not exist', () => {
    const stub: TestMessage = { type: 'ai', content: '', id: 'x' };
    const s = chatsReducer(
      initialState(),
      appendMessageToChat({ chatId: 'missing', message: asMsg(stub) }),
    );
    expect(s.chats).toHaveLength(0);
  });
});

describe('chats slice — updateLastMessageInChat', () => {
  it('concatenates new content onto the last message', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    const msg: TestMessage = { type: 'ai', content: 'Hello', tool_calls: [], id: 'm1' };
    s = chatsReducer(s, appendMessageToChat({ chatId: 'c1', message: asMsg(msg) }));
    s = chatsReducer(s, updateLastMessageInChat({ chatId: 'c1', content: ' world' }));
    expect((s.chats[0].messages[0] as TestMessage).content).toBe('Hello world');
  });

  it('is a no-op when the chat has no messages', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    s = chatsReducer(s, updateLastMessageInChat({ chatId: 'c1', content: 'x' }));
    expect(s.chats[0].messages).toHaveLength(0);
  });
});

describe('chats slice — mergeToolResult', () => {
  it('finds the matching tool_call_id and sets content', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    const msg: TestMessage = {
      type: 'ai',
      content: '',
      tool_calls: [{ id: 'tc-1', name: 'search', args: {} }],
      id: 'm1',
    };
    s = chatsReducer(s, appendMessageToChat({ chatId: 'c1', message: asMsg(msg) }));
    s = chatsReducer(s, mergeToolResult({ chatId: 'c1', toolCallId: 'tc-1', content: 'result data' }));

    const toolCall = (s.chats[0].messages[0] as TestMessage).tool_calls![0];
    expect(toolCall.content).toBe('result data');
  });

  it('is a no-op when the tool_call_id is not found', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    const msg: TestMessage = {
      type: 'ai',
      content: '',
      tool_calls: [{ id: 'tc-1', name: 'search', args: {} }],
      id: 'm1',
    };
    s = chatsReducer(s, appendMessageToChat({ chatId: 'c1', message: asMsg(msg) }));
    s = chatsReducer(s, mergeToolResult({ chatId: 'c1', toolCallId: 'missing', content: 'x' }));
    // tc-1 still has no content
    expect((s.chats[0].messages[0] as TestMessage).tool_calls![0].content).toBeUndefined();
  });

  it('merges mcpApp and fills arguments from the tool call args', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    const msg: TestMessage = {
      type: 'ai',
      content: '',
      tool_calls: [{ id: 'tc-1', name: 'show_chart', args: { topic: 'sales' } }],
      id: 'm1',
    };
    s = chatsReducer(s, appendMessageToChat({ chatId: 'c1', message: asMsg(msg) }));
    s = chatsReducer(
      s,
      mergeToolResult({
        chatId: 'c1',
        toolCallId: 'tc-1',
        content: 'ok',
        artifact: { structured_content: { n: 1 } },
        mcpApp: {
          server: 'chart-mcp-server',
          resourceUri: 'ui://charts/app.html',
          result: { content: [{ type: 'text', text: 'ok' }], isError: false },
        },
      }),
    );

    const toolCall = (s.chats[0].messages[0] as TestMessage).tool_calls![0] as {
      content?: unknown;
      artifact?: { structured_content?: { n?: number } };
      mcpApp?: { arguments?: { topic?: string }; resourceUri?: string };
    };
    expect(toolCall.content).toBe('ok');
    expect(toolCall.artifact?.structured_content?.n).toBe(1);
    expect(toolCall.mcpApp?.resourceUri).toBe('ui://charts/app.html');
    expect(toolCall.mcpApp?.arguments?.topic).toBe('sales');
  });

  it('prefers mcpApp.arguments over tool call args when both are present', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    const msg: TestMessage = {
      type: 'ai',
      content: '',
      tool_calls: [{ id: 'tc-1', name: 'show_chart', args: { topic: 'sales' } }],
      id: 'm1',
    };
    s = chatsReducer(s, appendMessageToChat({ chatId: 'c1', message: asMsg(msg) }));
    s = chatsReducer(
      s,
      mergeToolResult({
        chatId: 'c1',
        toolCallId: 'tc-1',
        content: 'ok',
        mcpApp: {
          server: 'chart-mcp-server',
          resourceUri: 'ui://charts/app.html',
          arguments: { topic: 'from-app' },
          result: { content: [], isError: false },
        },
      }),
    );

    const toolCall = (s.chats[0].messages[0] as TestMessage).tool_calls![0] as {
      mcpApp?: { arguments?: { topic?: string } };
    };
    expect(toolCall.mcpApp?.arguments?.topic).toBe('from-app');
  });
});

describe('chats slice — resolveAllPendingToolCalls', () => {
  it('sets content to empty string on all tool_calls with null content', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    const msg: TestMessage = {
      type: 'ai',
      content: '',
      tool_calls: [
        { id: 'tc-1', name: 'a', args: {} },
        { id: 'tc-2', name: 'b', args: {} },
      ],
      id: 'm1',
    };
    s = chatsReducer(s, appendMessageToChat({ chatId: 'c1', message: asMsg(msg) }));
    s = chatsReducer(s, resolveAllPendingToolCalls({ chatId: 'c1' }));

    const tcs = (s.chats[0].messages[0] as TestMessage).tool_calls!;
    expect(tcs[0].content).toBe('');
    expect(tcs[1].content).toBe('');
  });

  it('does not overwrite a tool_call that already has content', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    const msg: TestMessage = {
      type: 'ai',
      content: '',
      tool_calls: [{ id: 'tc-1', name: 'a', args: {}, content: 'already set' }],
      id: 'm1',
    };
    s = chatsReducer(s, appendMessageToChat({ chatId: 'c1', message: asMsg(msg) }));
    s = chatsReducer(s, resolveAllPendingToolCalls({ chatId: 'c1' }));

    const tc = (s.chats[0].messages[0] as TestMessage).tool_calls![0];
    expect(tc.content).toBe('already set');
  });
});

describe('chats slice — setMessageFeedback', () => {
  it('stores up/down feedback for a message', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    s = chatsReducer(s, setMessageFeedback({ chatId: 'c1', messageId: 'msg-1', feedback: 'up' }));
    expect(s.chats[0].feedback['msg-1']).toBe('up');
  });

  it('removes feedback when null is passed', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    s = chatsReducer(s, setMessageFeedback({ chatId: 'c1', messageId: 'msg-1', feedback: 'down' }));
    s = chatsReducer(s, setMessageFeedback({ chatId: 'c1', messageId: 'msg-1', feedback: null }));
    expect(s.chats[0].feedback['msg-1']).toBeUndefined();
  });
});

describe('chats slice — updateStreamingState', () => {
  it('merges partial streaming state for a chat', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    s = chatsReducer(
      s,
      updateStreamingState({ chatId: 'c1', state: { isLoading: true, error: null } }),
    );
    expect(s.streamingStates['c1'].isLoading).toBe(true);
  });

  it('stores a pendingInterrupt in streaming state', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    const interrupt = { value: 'Approve this action?', resumable: true };
    s = chatsReducer(
      s,
      updateStreamingState({ chatId: 'c1', state: { pendingInterrupt: interrupt } }),
    );
    expect(s.streamingStates['c1'].pendingInterrupt).toEqual(interrupt);
  });

  it('creates a new streaming state entry when none exists', () => {
    const s = chatsReducer(
      initialState(),
      updateStreamingState({ chatId: 'new-chat', state: { isLoading: true } }),
    );
    expect(s.streamingStates['new-chat'].isLoading).toBe(true);
    // defaults are preserved
    expect(s.streamingStates['new-chat'].pendingInterrupt).toBeNull();
  });
});

describe('chats slice — project assignment', () => {
  it('selectChatsByProject returns chats in that project', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    s = chatsReducer(s, addChat(makeChat('c2', { project_id: 'p1' })));
    const state = { chats: s };
    expect(selectChatsByProject(state, 'p1').map((c) => c.id)).toEqual(['c2']);
    expect(selectChatsByProject(state, 'p1')).toBe(selectChatsByProject(state, 'p1'));
  });

  it('optimistically sets project_id while assign is pending', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1', { project_id: null })));
    s = chatsReducer(
      s,
      assignThreadToProjectThunk.pending('', { threadId: 'c1', projectId: 'p1' }),
    );
    expect(s.chats[0].project_id).toBe('p1');
    expect(s.chats[0]._prevProjectId).toBeNull();
  });

  it('rolls back project_id when assign is rejected', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1', { project_id: 'p0' })));
    s = chatsReducer(
      s,
      assignThreadToProjectThunk.pending('', { threadId: 'c1', projectId: 'p1' }),
    );
    s = chatsReducer(
      s,
      assignThreadToProjectThunk.rejected(new Error('fail'), '', { threadId: 'c1', projectId: 'p1' }),
    );
    expect(s.chats[0].project_id).toBe('p0');
  });

  it('rolls back to null when the chat had no project_id field', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1')));
    expect(s.chats[0].project_id).toBeUndefined();
    s = chatsReducer(
      s,
      assignThreadToProjectThunk.pending('', { threadId: 'c1', projectId: 'p1' }),
    );
    s = chatsReducer(
      s,
      assignThreadToProjectThunk.rejected(new Error('fail'), '', { threadId: 'c1', projectId: 'p1' }),
    );
    expect(s.chats[0].project_id).toBeNull();
  });

  it('restores project_id on assign fulfilled after the chat list is replaced', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1', { project_id: null })));
    s = chatsReducer(
      s,
      assignThreadToProjectThunk.pending('', { threadId: 'c1', projectId: 'p1' }),
    );
    s = chatsReducer(
      s,
      setChats([{ ...s.chats[0], project_id: null, _prevProjectId: null }]),
    );
    s = chatsReducer(
      s,
      assignThreadToProjectThunk.fulfilled(
        { threadId: 'c1', projectId: 'p1' },
        '',
        { threadId: 'c1', projectId: 'p1' },
      ),
    );
    expect(s.chats[0].project_id).toBe('p1');
    expect(s.chats[0]._prevProjectId).toBeUndefined();
  });

  it('clears project_id for all project chats after unassign-all', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1', { project_id: 'p1' })));
    s = chatsReducer(s, addChat(makeChat('c2', { project_id: 'p1' })));
    s = chatsReducer(s, addChat(makeChat('c3', { project_id: 'p2' })));
    s = chatsReducer(
      s,
      unassignAllThreadsThunk.fulfilled(
        { projectId: 'p1' },
        '',
        'p1',
      ),
    );
    expect(s.chats.find((c) => c.id === 'c1')?.project_id).toBeNull();
    expect(s.chats.find((c) => c.id === 'c2')?.project_id).toBeNull();
    expect(s.chats.find((c) => c.id === 'c3')?.project_id).toBe('p2');
  });

  it('clears project_id when a project is deleted with keepThreads', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1', { project_id: 'p1' })));
    s = chatsReducer(
      s,
      deleteProjectThunk.fulfilled(
        { projectId: 'p1', deletedThreadIds: [], keepThreads: true },
        '',
        { projectId: 'p1', keepThreads: true },
      ),
    );
    expect(s.chats[0].project_id).toBeNull();
    expect(s.chats).toHaveLength(1);
  });

  it('leaves chats in place when a project is hard-deleted', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1', { project_id: 'p1' })));
    s = chatsReducer(
      s,
      deleteProjectThunk.fulfilled(
        { projectId: 'p1', deletedThreadIds: ['c1'], keepThreads: false },
        '',
        { projectId: 'p1', keepThreads: false },
      ),
    );
    expect(s.chats).toHaveLength(1);
    expect(s.chats[0].project_id).toBe('p1');
  });

  it('clears project_id when delete reports the project missing', () => {
    let s = chatsReducer(initialState(), addChat(makeChat('c1', { project_id: 'p1' })));
    s = chatsReducer(
      s,
      deleteProjectThunk.fulfilled(
        { projectId: 'p1', deletedThreadIds: [], keepThreads: false, missing: true },
        '',
        { projectId: 'p1', keepThreads: false },
      ),
    );
    expect(s.chats).toHaveLength(1);
    expect(s.chats[0].project_id).toBeNull();
  });
});
