import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { Message } from '@langchain/langgraph-sdk';
import type { SubAgentInfo, InterruptInfo, TaskStep } from '../../types/deep-agent';

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

type ToolCallRecord = { id?: string; content?: unknown };

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
        if (msgId && chat.messages.some((m) => (m as Record<string, unknown>).id === msgId)) {
          return;
        }
        chat.messages.push(deepClone(message));
      }
    },
    updateLastMessageInChat(state, action: PayloadAction<{ chatId: string; content: string }>) {
      const { chatId, content } = action.payload;
      const chat = state.chats.find((c) => c.id === chatId);
      if (!chat || chat.messages.length === 0) {
        return;
      }
      const last = chat.messages.at(-1) as Message & { content?: unknown };
      let prev = '';
      if (typeof last.content === 'string') {
        prev = last.content;
      }
      (last as { content: string }).content = prev + content;
    },
    mergeToolResult(state, action: PayloadAction<{ chatId: string; toolCallId: string; content: any }>) {
      const { chatId, toolCallId, content } = action.payload;
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
          return;
        }
      }
    },
    resolveAllPendingToolCalls(state, action: PayloadAction<{ chatId: string }>) {
      const chat = state.chats.find((c) => c.id === action.payload.chatId);
      if (!chat) return;
      for (const message of chat.messages) {
        const msg = message as Message & { tool_calls?: ToolCallRecord[] };
        if (!Array.isArray(msg.tool_calls)) continue;
        for (const tc of msg.tool_calls) {
          if (tc && tc.content == null) {
            tc.content = '';
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
});

export const {
  setChats,
  addChat,
  updateChat,
  deleteChat,
  clearAllChats,
  appendMessageToChat,
  removeLastMessageFromChat,
  updateLastMessageInChat,
  mergeToolResult,
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

export default chatsSlice.reducer;
