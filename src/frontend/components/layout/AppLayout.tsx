import React, { useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
import { ErrorBoundary } from '../ErrorBoundary';
import { useChat } from '../../contexts/ChatContext';
import { SidebarChatItem } from '../../types/chat';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { chats, deleteChat, renameChat, createNewChat } = useChat();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navigate = useNavigate();
  const { threadId } = useParams<{ threadId?: string }>();
  
  // Get user data from window.USER_DATA
  const userData = useMemo(() => {
    return window.USER_DATA;
  }, []);
  
  const userName = userData?.name || userData?.given_name || "User";

  // Convert chats to sidebar format
  const sidebarChats: SidebarChatItem[] = useMemo(() => 
    chats.map(chat => ({
      id: chat.id,
      title: chat.title,
      timestamp: chat.timestamp,
      preview: chat.messages.length > 0 
        ? (chat.messages[0].content as string).substring(0, 60) + "..."
        : chat.preview,
    })), [chats]
  );

  const handleToggleCollapse = () => {
    setSidebarCollapsed(prev => !prev);
  };

  const handleSelectChat = (chatId: string) => {
    navigate(`/chat/${chatId}`);
  };

  const handleDeleteChat = (chatId: string) => {
    deleteChat(chatId);
    // Navigate to home if we're currently on the deleted chat
    if (window.location.pathname === `/chat/${chatId}`) {
      const remainingChats = chats.filter(chat => chat.id !== chatId);
      if (remainingChats.length > 0) {
        navigate(`/chat/${remainingChats[0].id}`);
      } else {
        navigate('/');
      }
    }
  };

  return (
    <div className="flex h-screen bg-neutral-800 text-neutral-100 font-sans antialiased">
      <ErrorBoundary
        onError={(error, errorInfo) => {
          console.error('Sidebar error:', error, errorInfo);
        }}
      >
        <Sidebar
          userName={userName}
          currentChatId={threadId}
          chatHistory={sidebarChats}
          isCollapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleCollapse}
          onNewChat={createNewChat}
          onSelectChat={handleSelectChat}
          onDeleteChat={handleDeleteChat}
          onRenameChat={renameChat}
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
