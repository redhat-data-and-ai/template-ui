import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import type { Message } from "@langchain/langgraph-sdk";

import { ChatItem, ChatState, ChatContextType, DeepResearchEvent, ProcessedEvent } from '../types/chat';
import { chatStorage } from '../services/chatStorage';
import { getAllThreadsByUserId } from '@/services/agent-rest';

// Action types
type ChatAction =
  | { type: 'SET_CHATS'; payload: ChatItem[] }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_CHAT'; payload: ChatItem }
  | { type: 'UPDATE_CHAT'; payload: { id: string; updates: Partial<ChatItem> } }
  | { type: 'DELETE_CHAT'; payload: string };

// Initial state
const initialState: ChatState = {
  chats: [],
  isLoading: true, // Start as loading while we load from localStorage
  error: null,
};

// Reducer
function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'SET_CHATS':
      return { ...state, chats: action.payload };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'ADD_CHAT':
      return { ...state, chats: [action.payload, ...state.chats] };

    case 'UPDATE_CHAT':
      return {
        ...state,
        chats: state.chats.map(chat =>
          chat.id === action.payload.id
            ? { ...chat, ...action.payload.updates }
            : chat
        ),
      };

    case 'DELETE_CHAT':
      return {
        ...state,
        chats: state.chats.filter(chat => chat.id !== action.payload),
      };

    default: {
      const _exhaustive: never = action;
      return _exhaustive as unknown as ChatState ?? state;
    }
  }
}

// Generate chat title from first message
function generateChatTitle(content: string): string {
  const maxLength = 40;
  const cleaned = content.trim();
  return cleaned.length > maxLength
    ? cleaned.substring(0, maxLength) + "..."
    : cleaned || "New Chat";
}

// Create context
const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Provider component
interface ChatProviderProps {
  children: React.ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
  const [state, dispatch] = useReducer(chatReducer, initialState);
  const navigate = useNavigate();

  // Load chats from storage on mount
  useEffect(() => {
    const loadedChats = chatStorage.loadChats();
    dispatch({ type: 'SET_CHATS', payload: loadedChats });
    dispatch({ type: 'SET_LOADING', payload: false }); // Mark loading as complete
  }, []);

  // Save chats to storage whenever they change (merge to protect background stream data)
  useEffect(() => {
    if (state.chats.length > 0) {
      const stored = chatStorage.loadChats();
      const storedMap = new Map(stored.map(c => [c.id, c]));
      const merged = state.chats.map(chat => {
        const inStorage = storedMap.get(chat.id);
        if (inStorage && (inStorage.messages?.length ?? 0) > (chat.messages?.length ?? 0)) {
          return { ...chat, messages: inStorage.messages };
        }
        return chat;
      });
      chatStorage.saveChats(merged);
    }
  }, [state.chats]);

  useEffect(() => {
    async function loadUserHistory() {
      try {
        dispatch({ type: 'SET_LOADING', payload: true });
        const userId = window.USER_DATA?.preferred_username ?? 'anonymous';
        const history = await getAllThreadsByUserId(userId);

        const serverChats: ChatItem[] = history.map((conversation) => {
          let title = 'New Chat';
          if (Array.isArray(conversation.messages) && conversation.messages.length > 0) {
            title = conversation.messages.find((message) => message.type === 'human')?.content as string;
          }
          return {
            id: conversation.id,
            messages: conversation.messages,
            title,
            preview: title,
          }
        });

        const localChats = chatStorage.loadChats();
        const mergedMap = new Map<string, ChatItem>(localChats.map(c => [c.id, c]));

        for (const serverChat of serverChats) {
          const local = mergedMap.get(serverChat.id);
          if (!local) {
            mergedMap.set(serverChat.id, serverChat);
          } else if (serverChat.messages.length > (local.messages?.length || 0)) {
            mergedMap.set(serverChat.id, {
              ...serverChat,
              historicalActivities: local.historicalActivities || {},
              deepResearchEvents: local.deepResearchEvents || [],
            });
          }
        }

        const merged = Array.from(mergedMap.values());
        dispatch({ type: 'SET_CHATS', payload: merged });
      } catch (error) {
        console.error(error)
      } finally {
        dispatch({ type: 'SET_LOADING', payload: false });
      }
    }

    loadUserHistory()
  }, []);

  // Actions
  const createNewChat = useCallback((): string => {
    const newChatId = uuidv4();
    const newChat: ChatItem = {
      id: newChatId,
      title: "New Chat",
      timestamp: new Date(),
      preview: "Start a new conversation",
      messages: [],
      historicalActivities: {},
    };

    dispatch({ type: 'ADD_CHAT', payload: newChat });
    dispatch({ type: 'SET_ERROR', payload: null });

    // Navigate to new chat
    navigate(`/chat/${newChatId}`);

    return newChatId;
  }, [navigate]);

  const deleteChat = useCallback((chatId: string) => {
    dispatch({ type: 'DELETE_CHAT', payload: chatId });

    // Clear storage if no chats remain  
    if (state.chats.filter(chat => chat.id !== chatId).length === 0) {
      chatStorage.clearChats();
    }

    // Navigation will be handled by the component that calls this
  }, [state.chats]);

  const renameChat = useCallback((chatId: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim() || "Untitled Chat";
    dispatch({
      type: 'UPDATE_CHAT',
      payload: { id: chatId, updates: { title: trimmedTitle } }
    });
  }, []);

  const updateChatMessages = useCallback((chatId: string, messages: Message[]) => {
    const updates: Partial<ChatItem> = {
      messages: [...messages],
      timestamp: new Date(),
    };

    // Auto-generate title from first message if still "New Chat"
    const chat = state.chats.find(c => c.id === chatId);
    if (chat && chat.title === "New Chat" && messages.length > 0) {
      updates.title = generateChatTitle(messages[0].content as string);
      updates.preview = (messages[0].content as string).substring(0, 60) + "...";
    }

    dispatch({
      type: 'UPDATE_CHAT',
      payload: { id: chatId, updates }
    });
  }, [state.chats]);

  const updateChatActivities = useCallback((chatId: string, messageId: string, activities: ProcessedEvent[]) => {
    const chat = state.chats.find(c => c.id === chatId);
    if (chat) {
      const newHistoricalActivities = {
        ...chat.historicalActivities,
        [messageId]: [...activities],
      };

      dispatch({
        type: 'UPDATE_CHAT',
        payload: {
          id: chatId,
          updates: {
            historicalActivities: newHistoricalActivities,
            timestamp: new Date()
          }
        }
      });
    }
  }, [state.chats]);

  const updateChatDeepResearchEvents = useCallback((chatId: string, drEvents: DeepResearchEvent[]) => {
    dispatch({
      type: 'UPDATE_CHAT',
      payload: { id: chatId, updates: { deepResearchEvents: drEvents } }
    });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'SET_ERROR', payload: null });
  }, []);

  const setError = useCallback((error: string) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const getChatById = useCallback((chatId: string) => {
    return state.chats.find(chat => chat.id === chatId);
  }, [state]);

  const value: ChatContextType = useMemo(() => ({
    ...state,
    createNewChat,
    deleteChat,
    renameChat,
    updateChatMessages,
    updateChatActivities,
    updateChatDeepResearchEvents,
    clearError,
    setError,
    getChatById,
  }), [
    state,
    createNewChat,
    deleteChat,
    renameChat,
    updateChatMessages,
    updateChatActivities,
    updateChatDeepResearchEvents,
    clearError,
    setError,
    getChatById,
  ]);

  return (
    <ChatContext.Provider value={value}>
      {children}
    </ChatContext.Provider>
  );
}

// Hook to use chat context
export function useChat(): ChatContextType {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
