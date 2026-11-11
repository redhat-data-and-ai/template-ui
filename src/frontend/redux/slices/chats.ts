import { createSelector, createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Message } from '@langchain/langgraph-sdk';
import type { SubAgentInfo, InterruptInfo, SubagentTranscriptEntry, SubagentTranscriptTool, TaskStep } from '../../types/deep-agent';
import { extractDelegationText, isSubAgentToolCall } from '../../types/deep-agent';
import { withMcpAppArguments } from '../../types/mcp-apps';
import { assignThreadToProjectThunk, deleteProjectThunk, unassignAllThreadsThunk } from './projects';

export interface StreamingState {
  isLoading: boolean;
  isThinking: boolean;
  isConnected: boolean;
  error: string | null;
  currentRunId: string | null;
  activeSubAgent: SubAgentInfo | null;
  pendingInterrupt: InterruptInfo | null;
  taskSteps: TaskStep[];
  isReconnecting: boolean;
  reconnectAttempt: number;
  streamDroppedMidResponse: boolean;
}

export interface ChatItem {
  id: string;
  title: string;
  timestamp: string;
  preview: string;
  messages: Message[];
  historicalActivities: Record<string, any[]>;
  feedback: Record<string, 'up' | 'down'>;
  project_id?: string | null;
  _prevProjectId?: string | null;
}

export interface ChatsState {
  chats: ChatItem[];
  isLoadingThreads: boolean;
  threadsListHydrated: boolean;
  isLoadingMessages: Record<string, boolean>;
  streamingStates: Record<string, StreamingState>;
  error: string | null;
}

const DEFAULT_STREAMING_STATE: StreamingState = {
  isLoading: false,
  isThinking: false,
  isConnected: false,
  error: null,
  currentRunId: null,
  activeSubAgent: null,
  pendingInterrupt: null,
  taskSteps: [],
  isReconnecting: false,
  reconnectAttempt: 0,
  streamDroppedMidResponse: false,
};

const initialState: ChatsState = {
  chats: [],
  isLoadingThreads: true,
  threadsListHydrated: false,
  isLoadingMessages: {},
  streamingStates: {},
  error: null,
};

type ToolCallRecord = {
  id?: string;
  name?: string;
  content?: unknown;
  status?: string;
  args?: Record<string, unknown>;
  mcpApp?: Record<string, unknown>;
  artifact?: unknown;
  transcript?: SubagentTranscriptEntry[];
};

function findToolCall(chat: ChatItem, toolCallId: string): ToolCallRecord | undefined {
  for (const message of chat.messages) {
    const toolCalls = (message as Message & { tool_calls?: ToolCallRecord[] }).tool_calls;
    if (!Array.isArray(toolCalls)) continue;
    const match = toolCalls.find((toolCall) => toolCall?.id === toolCallId);
    if (match) return match;
  }
  return undefined;
}

function transcriptSize(entries: SubagentTranscriptEntry[]): number {
  return entries.reduce((total, entry) => {
    const tools = entry.tool_calls?.length ?? 0;
    return total + (entry.thinking?.length ?? 0) + (entry.content?.length ?? 0) + tools;
  }, 0);
}

function transcriptEntry(transcript: SubagentTranscriptEntry[], messageId: string): SubagentTranscriptEntry {
  const existing = messageId ? transcript.find((entry) => entry.id === messageId) : transcript.at(-1);
  if (existing) return existing;
  const created: SubagentTranscriptEntry = { id: messageId || `sub-${transcript.length}`, content: '' };
  transcript.push(created);
  return created;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

const chatsSlice = createSlice({
  name: 'chats',
  initialState,
  reducers: {
    setChats(state, action: PayloadAction<ChatItem[]>) {
      state.chats = deepClone(action.payload);
    },
    addChat(state, action: PayloadAction<ChatItem>) {
      state.chats.unshift(action.payload);
    },
    updateChat(state, action: PayloadAction<{ id: string; updates: Partial<ChatItem> }>) {
      const { id, updates } = action.payload;
      const chat = state.chats.find((c) => c.id === id);
      if (chat) {
        Object.assign(chat, updates);
      }
    },
    deleteChat(state, action: PayloadAction<string>) {
      const id = action.payload;
      state.chats = state.chats.filter((c) => c.id !== id);
    },
    clearAllChats(state) {
      state.chats = [];
      state.streamingStates = {};
      state.error = null;
    },
    removeLastMessageFromChat(state, action: PayloadAction<{ chatId: string }>) {
      const { chatId } = action.payload;
      const chat = state.chats.find((c) => c.id === chatId);
      if (chat && chat.messages.length > 0) {
        chat.messages.pop();
      }
    },
    appendMessageToChat(state, action: PayloadAction<{ chatId: string; message: Message }>) {
      const { chatId, message } = action.payload;
      const chat = state.chats.find((c) => c.id === chatId);
      if (chat) {
        const msgId = (message as Record<string, unknown>).id;
        if (msgId) {
          const existing = chat.messages.find((m) => (m as { id?: string }).id === msgId) as
            | (Message & { tool_calls?: unknown[] })
            | undefined;
          if (existing) {
            const incomingTools = (message as { tool_calls?: unknown[] }).tool_calls;
            const alreadyHasTools = Array.isArray(existing.tool_calls) && existing.tool_calls.length > 0;
            if (Array.isArray(incomingTools) && incomingTools.length > 0 && !alreadyHasTools) {
              existing.tool_calls = deepClone(incomingTools);
            }
            return;
          }
        }
        chat.messages.push(deepClone(message));
      }
    },
    appendSubagentTranscript(
      state,
      action: PayloadAction<{
        chatId: string;
        toolCallId: string;
        messageId?: string;
        content?: string;
        part?: 'thinking' | 'text';
        toolCalls?: SubagentTranscriptTool[];
        replace?: boolean;
      }>,
    ) {
      const { chatId, toolCallId, messageId, content, part, toolCalls, replace } = action.payload;
      const chat = state.chats.find((item) => item.id === chatId);
      const parent = chat ? findToolCall(chat, toolCallId) : undefined;
      if (!parent) return;
      if (!Array.isArray(parent.transcript)) parent.transcript = [];
      if (replace) {
        parent.transcript = parent.transcript.filter((entry) => entry.id !== (messageId ?? ''));
      }
      const entry = transcriptEntry(parent.transcript, messageId ?? '');
      if (part === 'thinking') {
        entry.thinking = (entry.thinking ?? '') + (content ?? '');
      } else if (content) {
        entry.content = (entry.content ?? '') + content;
      }
      if (Array.isArray(toolCalls) && toolCalls.length > 0 && !entry.tool_calls?.length) {
        entry.tool_calls = deepClone(toolCalls);
      }
    },
    attachSubagentTranscripts(
      state,
      action: PayloadAction<{
        chatId: string;
        transcripts: Array<{ delegation: string; entries: SubagentTranscriptEntry[] }>;
      }>,
    ) {
      const { chatId, transcripts } = action.payload;
      const chat = state.chats.find((item) => item.id === chatId);
      if (!chat || transcripts.length === 0) return;
      const cards: ToolCallRecord[] = [];
      for (const message of chat.messages) {
        const toolCalls = (message as Message & { tool_calls?: ToolCallRecord[] }).tool_calls;
        if (!Array.isArray(toolCalls)) continue;
        for (const toolCall of toolCalls) {
          if (toolCall?.name && isSubAgentToolCall({ name: toolCall.name, args: toolCall.args })) cards.push(toolCall);
        }
      }
      const used = new Set<number>();
      const claim = (card: ToolCallRecord, index: number) => {
        used.add(index);
        const saved = transcripts[index]?.entries ?? [];
        if (saved.length === 0) return;
        const current = Array.isArray(card.transcript) ? card.transcript : [];
        if (transcriptSize(current) > transcriptSize(saved)) return;
        card.transcript = deepClone(saved);
      };
      for (const card of cards) {
        const delegation = extractDelegationText(card) ?? '';
        const index = transcripts.findIndex((item, itemIndex) => !used.has(itemIndex) && item.delegation === delegation);
        if (index !== -1) claim(card, index);
      }
      for (const card of cards) {
        if (Array.isArray(card.transcript) && card.transcript.length > 0) continue;
        const index = transcripts.findIndex((_item, itemIndex) => !used.has(itemIndex));
        if (index !== -1) claim(card, index);
      }
    },
    mergeSubagentToolResult(
      state,
      action: PayloadAction<{
        chatId: string;
        parentToolCallId: string;
        toolCallId: string;
        content: unknown;
        status?: string;
        mcpApp?: Record<string, unknown>;
        artifact?: unknown;
      }>,
    ) {
      const { chatId, parentToolCallId, toolCallId, content, status, mcpApp, artifact } = action.payload;
      const chat = state.chats.find((item) => item.id === chatId);
      const parent = chat ? findToolCall(chat, parentToolCallId) : undefined;
      const match = parent?.transcript
        ?.flatMap((entry) => entry.tool_calls ?? [])
        .find((toolCall) => toolCall?.id === toolCallId);
      if (!match) return;
      match.content = content;
      if (status) match.status = status;
      if (artifact !== undefined) match.artifact = artifact;
      if (mcpApp) {
        match.mcpApp = withMcpAppArguments(mcpApp, match.args);
      }
    },
    updateLastMessageInChat(state, action: PayloadAction<{ chatId: string; content: string; part?: 'thinking' | 'text' }>) {
      const { chatId, content, part } = action.payload;
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat || chat.messages.length === 0) {
        return;
      }
      const last = chat.messages.at(-1) as Message & { content?: unknown; thinking?: string };
      if (part === 'thinking') {
        const prevThinking = typeof last.thinking === 'string' ? last.thinking : '';
        last.thinking = prevThinking + content;
        return;
      }
      let prev = '';
      if (typeof last.content === 'string') {
        prev = last.content;
      }
      (last as { content: string }).content = prev + content;
    },
    mergeToolResult(
      state,
      action: PayloadAction<{
        chatId: string;
        toolCallId: string;
        content: any;
        status?: string;
        mcpApp?: Record<string, unknown>;
        artifact?: unknown;
      }>,
    ) {
      const { chatId, toolCallId, content, status, mcpApp, artifact } = action.payload;
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat) {
        return;
      }
      for (const message of chat.messages) {
        const msg = message as Message & { tool_calls?: ToolCallRecord[] };
        const toolCalls = msg.tool_calls;
        if (!Array.isArray(toolCalls)) {
          continue;
        }
        const match = toolCalls.find((tc) => tc?.id === toolCallId);
        if (match) {
          match.content = content;
          if (status) {
            match.status = status;
          }
          if (artifact !== undefined) {
            match.artifact = artifact;
          }
          if (mcpApp) {
            // Fill arguments from the AI tool_call so the host can push tool-input.
            match.mcpApp = withMcpAppArguments(
              mcpApp as Record<string, unknown>,
              match.args as Record<string, unknown> | undefined,
            );
          }
          return;
        }
      }
    },
    resolveAllPendingToolCalls(state, action: PayloadAction<{ chatId: string; status?: string; errorMessage?: string }>) {
      const chat = state.chats.find((c) => c.id === action.payload.chatId);
      if (!chat) return;
      const terminalStatus = action.payload.status || 'error';
      const fallbackContent = action.payload.errorMessage || '';
      for (const message of chat.messages) {
        const msg = message as Message & { tool_calls?: ToolCallRecord[] };
        if (!Array.isArray(msg.tool_calls)) continue;
        for (const tc of msg.tool_calls) {
          if (tc && tc.content == null) {
            tc.content = fallbackContent;
            tc.status = terminalStatus;
          }
        }
      }
    },
    setMessageFeedback(
      state,
      action: PayloadAction<{ chatId: string; messageId: string; feedback: 'up' | 'down' | null }>
    ) {
      const { chatId, messageId, feedback: nextFeedback } = action.payload;
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat) {
        return;
      }
      if (!chat.feedback) {
        chat.feedback = {};
      }
      if (nextFeedback === null) {
        delete chat.feedback[messageId];
      } else {
        chat.feedback[messageId] = nextFeedback;
      }
    },
    updateStreamingState(
      state,
      action: PayloadAction<{ chatId: string; state: Partial<StreamingState> }>
    ) {
      const { chatId, state: nextPartial } = action.payload;
      const prev = state.streamingStates[chatId] ?? DEFAULT_STREAMING_STATE;
      state.streamingStates[chatId] = { ...prev, ...nextPartial };
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    setLoadingThreads(state, action: PayloadAction<boolean>) {
      state.isLoadingThreads = action.payload;
    },
    setThreadsListHydrated(state, action: PayloadAction<boolean>) {
      state.threadsListHydrated = action.payload;
    },
    resetChatsState() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(assignThreadToProjectThunk.pending, (state, action) => {
        const { threadId, projectId } = action.meta.arg;
        const chat = state.chats.find((c) => c.id === threadId);
        if (chat) {
          chat._prevProjectId = chat.project_id ?? null;
          chat.project_id = projectId;
        }
      })
      .addCase(assignThreadToProjectThunk.rejected, (state, action) => {
        const { threadId } = action.meta.arg;
        const chat = state.chats.find((c) => c.id === threadId);
        if (chat && chat._prevProjectId !== undefined) {
          chat.project_id = chat._prevProjectId;
          delete chat._prevProjectId;
        }
      })
      .addCase(assignThreadToProjectThunk.fulfilled, (state, action) => {
        const { threadId, projectId } = action.meta.arg;
        const chat = state.chats.find((c) => c.id === threadId);
        if (chat) {
          chat.project_id = projectId;
          delete chat._prevProjectId;
        }
      })
      .addCase(unassignAllThreadsThunk.fulfilled, (state, action) => {
        const { projectId } = action.payload;
        for (const chat of state.chats) {
          if (chat.project_id === projectId) {
            chat.project_id = null;
          }
        }
      })
      .addCase(deleteProjectThunk.fulfilled, (state, action) => {
        if (!action.payload.keepThreads && !action.payload.missing) return;
        const { projectId } = action.payload;
        for (const chat of state.chats) {
          if (chat.project_id === projectId) {
            chat.project_id = null;
          }
        }
      });
  },
});

export const {
  setChats,
  addChat,
  updateChat,
  deleteChat,
  clearAllChats,
  appendMessageToChat,
  appendSubagentTranscript,
  attachSubagentTranscripts,
  removeLastMessageFromChat,
  updateLastMessageInChat,
  mergeToolResult,
  mergeSubagentToolResult,
  resolveAllPendingToolCalls,
  setMessageFeedback,
  updateStreamingState,
  setError,
  setLoadingThreads,
  setThreadsListHydrated,
  resetChatsState,
} = chatsSlice.actions;

export function selectAllChats(state: { chats: ChatsState }) {
  return state.chats.chats;
}

export function selectChatById(state: { chats: ChatsState }, chatId: string) {
  return state.chats.chats.find((c) => c.id === chatId);
}

export function selectStreamingState(state: { chats: ChatsState }, chatId: string): StreamingState {
  return state.chats.streamingStates[chatId] ?? DEFAULT_STREAMING_STATE;
}

export function selectIsLoadingThreads(state: { chats: ChatsState }) {
  return state.chats.isLoadingThreads;
}

export function selectThreadsListHydrated(state: { chats: ChatsState }) {
  return state.chats.threadsListHydrated;
}

export function selectChatsError(state: { chats: ChatsState }) {
  return state.chats.error;
}

export const selectChatsByProject = createSelector(
  [(state: { chats: ChatsState }) => state.chats.chats, (_state, projectId: string) => projectId],
  (chats, projectId) => chats.filter((c) => c.project_id === projectId),
);

export default chatsSlice.reducer;
