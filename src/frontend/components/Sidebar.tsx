import React, { useMemo, useState } from 'react';
import {
  SearchInput,
} from '@patternfly/react-core';
import { MessageSquare, Trash2, Edit3, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

import { Button } from './ui/button';
import type { SidebarChatItem } from '../types/chat';

interface SidebarProps {
  userName?: string;
  currentChatId?: string;
  chatHistory: SidebarChatItem[];
  tokenExpiry?: Date;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
}

function SidebarComponent({
  userName = 'User',
  currentChatId,
  chatHistory,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tokenExpiry,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  onRenameChat,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingChat, setEditingChat] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');


  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chatHistory;
    return chatHistory.filter(
      (chat) =>
        chat.title.toLowerCase().includes(q) || chat.preview.toLowerCase().includes(q)
    );
  }, [chatHistory, searchQuery]);

  const handleRename = (chatId: string, title: string) => {
    setEditingChat(chatId);
    setEditTitle(title);
  };

  const handleSaveRename = (chatId: string) => {
    onRenameChat(chatId, editTitle);
    setEditingChat(null);
    setEditTitle('');
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-sidebar border-r border-sidebar-border text-sidebar-foreground">
      {/* New Chat button */}
      <div className="shrink-0 p-3 pb-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Chat
        </button>
      </div>

      {/* Search */}
      {chatHistory.length > 3 && (
        <div className="shrink-0 px-3 py-1.5">
          <SearchInput
            placeholder="Search threads"
            aria-label="Search chat threads"
            value={searchQuery}
            onChange={(_e, value) => setSearchQuery(value)}
          />
        </div>
      )}

      {/* Separator + label */}
      <div className="shrink-0 px-3 pt-3 pb-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent chats</p>
      </div>

      {/* Chat list */}
      <div className="flex-1 min-h-0 overflow-y-auto chat-scroll px-1.5">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <MessageSquare className="w-6 h-6 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground/60">
              {chatHistory.length === 0 ? 'No chats yet' : 'No matching threads'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredChats.map((chat) => {
              const isActive = currentChatId === chat.id;

              return (
                <div
                  key={chat.id}
                  className={cn(
                    'group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer transition-colors',
                    isActive
                      ? 'bg-secondary text-foreground'
                      : 'text-foreground/70 hover:bg-secondary/50 hover:text-foreground'
                  )}
                  onClick={() => onSelectChat(chat.id)}
                >
                  {editingChat === chat.id ? (
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => handleSaveRename(chat.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(chat.id);
                        if (e.key === 'Escape') {
                          setEditingChat(null);
                          setEditTitle('');
                        }
                      }}
                      className="flex-1 bg-transparent text-sm text-foreground border border-border rounded px-1.5 py-0.5 outline-none focus:border-primary"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <p className="flex-1 text-sm truncate min-w-0">{chat.title}</p>
                  )}

                  {editingChat !== chat.id && (
                    <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-foreground rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRename(chat.id, chat.title);
                        }}
                        title="Rename chat"
                      >
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive rounded-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteChat(chat.id);
                        }}
                        title="Delete chat"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* User at bottom */}
      <div className="shrink-0 p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-sm font-semibold text-primary">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export const Sidebar = React.memo(SidebarComponent);
