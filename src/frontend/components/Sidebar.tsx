import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  SearchInput,
  Tooltip,
} from '@patternfly/react-core';
import { Loader2, MessageSquare, Trash2, Edit3, Plus, Settings, LogOut } from 'lucide-react';
import { logout } from '../services/logout';
import { cn } from '@/lib/utils';
import type { SidebarChatItem } from '../types/chat';
import type { SubAgentInfo } from '../types/deep-agent';
import { useAgentHealth } from '../hooks/useAgentHealth';

interface SidebarProps {
  userName?: string;
  currentChatId?: string;
  chatHistory: SidebarChatItem[];
  tokenExpiry?: Date;
  activeSubAgent?: SubAgentInfo | null;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onDeleteAllChats: () => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
}

function SidebarComponent({
  userName = 'User',
  currentChatId,
  chatHistory,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  tokenExpiry,
  activeSubAgent,
  onNewChat,
  onSelectChat,
  onDeleteChat,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDeleteAllChats,
  onRenameChat,
}: SidebarProps) {
  const navigate = useNavigate();
  const agentHealth = useAgentHealth();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingChat, setEditingChat] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);


  const filteredChats = useMemo(() => {
    if (chatHistory.length <= 3) return chatHistory;
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
    const trimmed = editTitle.trim();
    if (trimmed) {
      onRenameChat(chatId, trimmed);
    }
    setEditingChat(null);
    setEditTitle('');
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-sidebar border-r border-sidebar-border text-sidebar-foreground">
      {/* New Chat button */}
      <div className="shrink-0 p-3 pb-2">
        <Button variant="primary" isBlock onClick={onNewChat} aria-label="Start new chat" icon={<Plus className="w-4 h-4" />}>
          New Chat
        </Button>
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
      {filteredChats.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-10 px-4 text-center">
          <MessageSquare className="w-6 h-6 text-muted-foreground/40 mb-2" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">
            {chatHistory.length === 0 ? 'No chats yet' : 'No matching threads'}
          </p>
        </div>
      ) : (
        <ul
          aria-label="Chat history"
          className="flex-1 min-h-0 overflow-y-auto chat-scroll px-1.5 space-y-0.5 list-none"
        >
          {filteredChats.map((chat) => {
            const isActive = currentChatId === chat.id;

            const focusNeighbor = (delta: number) => {
              const idx = filteredChats.findIndex((c) => c.id === chat.id);
              const next = filteredChats[idx + delta];
              if (!next) return;
              document.getElementById(`sidebar-chat-btn-${next.id}`)?.focus();
            };

            const onBtnKeyDown = (e: React.KeyboardEvent) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                focusNeighbor(1);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                focusNeighbor(-1);
              }
            };

            return (
              <li
                key={chat.id}
                className={cn(
                  'relative group rounded-lg transition-colors',
                  isActive
                    ? 'bg-secondary text-foreground'
                    : 'hover:bg-secondary/50',
                )}
              >
                {editingChat === chat.id ? (
                  <div className="flex items-center gap-2 px-2.5 py-2">
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
                      aria-label={`Rename chat: ${chat.title}`}
                      className="flex-1 bg-transparent text-sm text-foreground border border-border rounded px-1.5 py-0.5 outline-none focus:border-primary"
                      autoFocus
                    />
                  </div>
                ) : (
                  <>
                    <button
                      id={`sidebar-chat-btn-${chat.id}`}
                      type="button"
                      onClick={() => onSelectChat(chat.id)}
                      onKeyDown={onBtnKeyDown}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'w-full text-left text-sm px-2.5 py-2 pr-16 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                        isActive ? 'text-foreground' : 'text-foreground/70 hover:text-foreground',
                      )}
                    >
                      <span className="block truncate">{chat.title}</span>
                      {isActive && activeSubAgent && (
                        <span className="flex items-center gap-1.5 mt-0.5">
                          <Label
                            isCompact
                            color="blue"
                            icon={<Loader2 className="w-2.5 h-2.5 animate-spin" />}
                          >
                            <span className="capitalize">{activeSubAgent.name}</span>
                          </Label>
                        </span>
                      )}
                    </button>

                    <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <Button
                        variant="plain"
                        size="sm"
                        className="h-7 w-7 !p-0 text-muted-foreground hover:text-foreground focus-visible:opacity-100"
                        onClick={() => handleRename(chat.id, chat.title)}
                        aria-label={`Rename chat: ${chat.title}`}
                      >
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="plain"
                        size="sm"
                        className="h-7 w-7 !p-0 text-muted-foreground hover:text-destructive focus-visible:opacity-100"
                        onClick={() => setDeletingChatId(chat.id)}
                        aria-label={`Delete chat: ${chat.title}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="shrink-0 px-3 py-2 border-t border-sidebar-border">
        <Tooltip
          content={
            agentHealth.status === 'healthy'
              ? 'Agent: healthy'
              : agentHealth.status === 'unhealthy'
                ? 'Agent: offline'
                : 'Agent: status unknown'
          }
        >
          <div className="flex items-center gap-2 text-xs text-muted-foreground cursor-default">
            <span
              className={cn(
                'h-2 w-2 rounded-full shrink-0',
                agentHealth.status === 'healthy' && 'bg-green-500',
                agentHealth.status === 'unhealthy' && 'bg-red-500',
                agentHealth.status === 'unknown' && 'bg-gray-400',
              )}
              aria-hidden
            />
            <span className="truncate">
              {agentHealth.status === 'healthy'
                ? 'Agent: healthy'
                : agentHealth.status === 'unhealthy'
                  ? 'Agent: offline'
                  : 'Agent: unknown'}
            </span>
          </div>
        </Tooltip>
      </div>

      {/* Footer */}
      <div className="shrink-0 p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center text-sm font-semibold text-primary">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{userName}</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors cursor-pointer"
            aria-label="Open settings"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              void logout();
            }}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors cursor-pointer"
            aria-label="Log out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      <Modal
        variant={ModalVariant.small}
        isOpen={deletingChatId !== null}
        onClose={() => setDeletingChatId(null)}
        aria-label="Delete chat confirmation"
      >
        <ModalHeader title="Delete chat" />
        <ModalBody>
          Are you sure you want to delete this chat? This action cannot be undone.
        </ModalBody>
        <ModalFooter>
          <Button
            variant="danger"
            onClick={() => {
              if (deletingChatId) {
                onDeleteChat(deletingChatId);
                setDeletingChatId(null);
              }
            }}
          >
            Delete
          </Button>
          <Button variant="link" onClick={() => setDeletingChatId(null)}>
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

    </div>
  );
}

export const Sidebar = React.memo(SidebarComponent);
