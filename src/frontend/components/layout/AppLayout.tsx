import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../Sidebar';
import { ErrorBoundary } from '../ErrorBoundary';
import { useChat } from '../../contexts/ChatContext';
import { SidebarChatItem } from '../../types/chat';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '../ui/alert-dialog';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { chats, deleteChat, renameChat, createNewChat } = useChat();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const navigate = useNavigate();
  
  const userData = useMemo(() => {
    return window.USER_DATA;
  }, []);
  
  const userName = userData?.displayName || userData?.name || "User";
  const tokenExpiry = useMemo(() => {
    if (userData?.expiresAt) {
      return new Date(userData.expiresAt);
    }
    const fallback = new Date();
    fallback.setHours(fallback.getHours() + 2);
    return fallback;
  }, [userData?.expiresAt]);

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
    setDeletingChatId(chatId);
  };

  const confirmDelete = useCallback(() => {
    if (!deletingChatId) return;

    deleteChat(deletingChatId);
    if (window.location.pathname === `/chat/${deletingChatId}`) {
      const remainingChats = chats.filter(chat => chat.id !== deletingChatId);
      if (remainingChats.length > 0) {
        navigate(`/chat/${remainingChats[0].id}`);
      } else {
        navigate('/');
      }
    }
    setDeletingChatId(null);
  }, [deletingChatId, chats, deleteChat, navigate]);

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

      <AlertDialog open={!!deletingChatId} onOpenChange={(open) => !open && setDeletingChatId(null)}>
        <AlertDialogContent>
          <AlertDialogTitle>Delete chat?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this conversation. This action cannot be undone.
          </AlertDialogDescription>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
