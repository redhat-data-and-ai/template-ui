import type { Message } from "@langchain/langgraph-sdk";
import { ProcessedEvent } from "../components/ActivityTimeline";

export interface ChatItem {
  id: string;
  title: string;
  timestamp?: Date;
  preview: string;
  messages: Message[];
  historicalActivities?: Record<string, ProcessedEvent[]>;
  deepResearchEvents?: DeepResearchEvent[];
}

export interface ChatState {
  chats: ChatItem[];
  isLoading: boolean;
  error: string | null;
}

export interface ChatActions {
  createNewChat: () => string;
  deleteChat: (chatId: string) => void;
  renameChat: (chatId: string, newTitle: string) => void;
  updateChatMessages: (chatId: string, messages: Message[]) => void;
  updateChatActivities: (chatId: string, messageId: string, activities: ProcessedEvent[]) => void;
  updateChatDeepResearchEvents: (chatId: string, events: DeepResearchEvent[]) => void;
  clearError: () => void;
  setError: (error: string) => void;
  getChatById: (chatId: string) => ChatItem | undefined;
}

export interface ChatContextType extends ChatState, ChatActions {}

export interface SidebarChatItem {
  id: string;
  title: string;
  timestamp: Date;
  preview: string;
}

export interface DeepResearchEvent {
  stage: string;
  event_type: string;
  message: string;
  display_text: string;
  log_entry: string;
  ui_visible: boolean;
  details: Record<string, any>;
  timestamp?: string;
  triggerMessageId?: string;
}
