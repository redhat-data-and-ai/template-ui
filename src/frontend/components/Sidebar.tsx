import React, { useMemo, useState } from 'react';
import type { NavSelectClickHandler } from '@patternfly/react-core';
import {
  Nav,
  NavList,
  NavItem,
  Button as PFButton,
  SearchInput,
  Divider,
} from '@patternfly/react-core';
import { MessageSquare, Trash2, Edit3, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRefreshableToken } from '@/hooks/useRefreshableToken';
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

  const { tokenStatus } = useRefreshableToken();

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

  const selectChatNavHandler = (chatId: string): NavSelectClickHandler => () => {
    onSelectChat(chatId);
  };

  return (
    <div
      className={cn(
        'flex flex-col h-full min-h-0 bg-card border-r border-border text-card-foreground'
      )}
    >
      <div className="flex shrink-0 items-center gap-3 p-4 border-b border-border">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary">
          <User className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{userName}</p>
          <p className={cn('text-xs', tokenStatus.color)}>{tokenStatus.text}</p>
        </div>
      </div>

      <div className="shrink-0 p-4 border-b border-border">
        <PFButton variant="primary" isBlock onClick={onNewChat}>
          New Chat
        </PFButton>
      </div>

      <div className="shrink-0 px-4 py-3">
        <SearchInput
          placeholder="Search threads"
          aria-label="Search chat threads"
          value={searchQuery}
          onChange={(_e, value) => setSearchQuery(value)}
        />
      </div>

      <Divider className="shrink-0" />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <MessageSquare className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {chatHistory.length === 0 ? 'No chats yet' : 'No matching threads'}
            </p>
            {chatHistory.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">Start a conversation!</p>
            )}
          </div>
        ) : (
          <Nav aria-label="Chat threads">
            <NavList className="!pt-2 !pb-2">
              {filteredChats.map((chat) => {
                const isActive = currentChatId === chat.id;

                return (
                  <NavItem
                    key={chat.id}
                    isActive={isActive}
                    className={cn(
                      '!mt-1 group [&_.pf-v6-c-nav__link]:!rounded-md',
                      editingChat === chat.id && '[&_.pf-v6-c-nav__link]:!py-2'
                    )}
                    onClick={selectChatNavHandler(chat.id)}
                  >
                    <div className="flex items-center justify-between w-full gap-2 min-w-0">
                      <div className="flex min-w-0 flex-1 items-start gap-2">
                        <MessageSquare
                          className={cn(
                            'w-4 h-4 shrink-0 mt-0.5',
                            isActive ? 'text-primary' : 'text-muted-foreground'
                          )}
                        />
                        <div className="min-w-0 flex-1">
                          {editingChat === chat.id ? (
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              onBlur={() => handleSaveRename(chat.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleSaveRename(chat.id);
                                }
                                if (e.key === 'Escape') {
                                  setEditingChat(null);
                                  setEditTitle('');
                                }
                              }}
                              className="w-full bg-transparent text-sm font-medium text-foreground border border-border rounded px-1 py-0.5 outline-none focus:border-primary"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                            />
                          ) : (
                            <>
                              <span className="block truncate text-sm font-medium">
                                {chat.title}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground mt-0.5">
                                {chat.preview}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {editingChat !== chat.id && (
                        <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
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
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              onDeleteChat(chat.id);
                            }}
                            title="Delete chat"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </NavItem>
                );
              })}
            </NavList>
          </Nav>
        )}
      </div>

      <div className="shrink-0 p-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">Dataverse AI Chat</p>
      </div>
    </div>
  );
}

export const Sidebar = React.memo(SidebarComponent);
