import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Sidebar } from '../Sidebar';
import { ErrorBoundary } from '../ErrorBoundary';
import { useAppSelector, useAppDispatch } from '../../redux/hooks';
import {
  selectAllChats,
  addChat,
  deleteChat,
  updateChat,
  setChats,
  setLoadingThreads,
  setThreadsListHydrated,
  ChatItem,
} from '../../redux/slices/chats';
import { SidebarChatItem } from '../../types/chat';
import { chatStorage } from '../../services/chatStorage';
import { getAllThreadsByUserId } from '../../services/agent-rest';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const dispatch = useAppDispatch();
  const chats = useAppSelector(selectAllChats);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const loadedChats = chatStorage.loadChats();
    if (loadedChats.length > 0) {
      const mapped: ChatItem[] = loadedChats.map((c) => ({
        ...c,
        timestamp: typeof c.timestamp === 'string'
          ? c.timestamp
          : new Date(c.timestamp ?? Date.now()).toISOString(),
        historicalActivities: c.historicalActivities ?? {},
      }));
      dispatch(setChats(mapped));
    }
    dispatch(setLoadingThreads(false));
  }, [dispatch]);

  useEffect(() => {
    async function loadUserHistory() {
      try {
        dispatch(setLoadingThreads(true));
        const history = await getAllThreadsByUserId(window.USER_DATA.preferred_username);

        const mapped: ChatItem[] = history.map((conversation) => {
          let title = 'New Chat';
          if (Array.isArray(conversation.messages) && conversation.messages.length > 0) {
            title = (conversation.messages.find((m) => m.type === 'human')?.content as string) || 'New Chat';
          }
          return {
            id: conversation.id,
            messages: conversation.messages,
            title,
            preview: title,
            timestamp: new Date().toISOString(),
            historicalActivities: {},
          };
        });

        dispatch(setChats(mapped));
        dispatch(setThreadsListHydrated(true));
      } catch (error) {
        console.error('Failed to load user history:', error);
      } finally {
        dispatch(setLoadingThreads(false));
      }
    }

    loadUserHistory();
  }, [dispatch]);

  useEffect(() => {
    if (chats.length > 0) {
      chatStorage.saveChats(chats as any);
    }
  }, [chats]);

  const userData = useMemo(() => window.USER_DATA, []);
  const userName = userData?.displayName || userData?.name || 'User';
  const tokenExpiry = useMemo(() => {
    if (userData?.expiresAt) {
      return new Date(userData.expiresAt);
    }
    const fallback = new Date();
    fallback.setHours(fallback.getHours() + 2);
    return fallback;
  }, [userData?.expiresAt]);

  const sidebarChats: SidebarChatItem[] = useMemo(
    () =>
      chats.map((chat) => ({
        id: chat.id,
        title: chat.title,
        timestamp: new Date(chat.timestamp),
        preview:
          chat.messages.length > 0
            ? (chat.messages[0].content as string).substring(0, 60) + '...'
            : chat.preview,
      })),
    [chats]
  );

  const handleToggleCollapse = () => setSidebarCollapsed((prev) => !prev);

  const handleSelectChat = (chatId: string) => navigate(`/chat/${chatId}`);

  const handleNewChat = useCallback(() => {
    const newChatId = uuidv4();
    const newChat: ChatItem = {
      id: newChatId,
      title: 'New Chat',
      timestamp: new Date().toISOString(),
      preview: 'Start a new conversation',
      messages: [],
      historicalActivities: {},
    };
    dispatch(addChat(newChat));
    navigate(`/chat/${newChatId}`);
  }, [dispatch, navigate]);

  const handleDeleteChat = useCallback(
    (chatId: string) => {
      dispatch(deleteChat(chatId));
      if (window.location.pathname === `/chat/${chatId}`) {
        const remaining = chats.filter((c) => c.id !== chatId);
        navigate(remaining.length > 0 ? `/chat/${remaining[0].id}` : '/');
      }
    },
    [dispatch, chats, navigate]
  );

  const handleRenameChat = useCallback(
    (chatId: string, newTitle: string) => {
      dispatch(updateChat({ id: chatId, updates: { title: newTitle.trim() || 'Untitled Chat' } }));
    },
    [dispatch]
  );

  return (
    <div className="flex h-screen bg-neutral-800 text-neutral-100 font-sans antialiased">
      <ErrorBoundary
        onError={(error, errorInfo) => {
          console.error('Sidebar error:', error, errorInfo);
        }}
      >
        <Sidebar
          userName={userName}
          currentChatId={undefined}
          chatHistory={sidebarChats}
          isCollapsed={sidebarCollapsed}
          tokenExpiry={tokenExpiry}
          onToggleCollapse={handleToggleCollapse}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
          onRenameChat={handleRenameChat}
        />
      </ErrorBoundary>

      <ErrorBoundary
        onError={(error, errorInfo) => {
          console.error('Main content error:', error, errorInfo);
        }}
      >
        {children}
      </ErrorBoundary>
    </div>
  );
}
