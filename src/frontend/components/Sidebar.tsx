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
} from '@patternfly/react-core';
import { Loader2, MessageSquare, Trash2, Edit3, Plus, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { SidebarChatItem } from '../types/chat';
import type { SubAgentInfo } from '../types/deep-agent';

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
  onDeleteAllChats,
  onRenameChat,
}: SidebarProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingChat, setEditingChat] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);


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
        <Button variant="primary" isBlock onClick={onNewChat}>
          <Plus className="w-4 h-4" />
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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{chat.title}</p>
                      {isActive && activeSubAgent && (
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Label
                            isCompact
                            color="blue"
                            icon={<Loader2 className="w-2.5 h-2.5 animate-spin" />}
                          >
                            <span className="capitalize">{activeSubAgent.name}</span>
                          </Label>
                        </div>
                      )}
                    </div>
                  )}

                  {editingChat !== chat.id && (
                    <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="plain"
                        size="sm"
                        className="h-6 w-6 !p-0 text-muted-foreground hover:text-foreground"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          handleRename(chat.id, chat.title);
                        }}
                        aria-label="Rename chat"
                      >
                        <Edit3 className="w-3 h-3" />
                      </Button>
                      <Button
                        variant="plain"
                        size="sm"
                        className="h-6 w-6 !p-0 text-muted-foreground hover:text-destructive"
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setDeletingChatId(chat.id);
                        }}
                        aria-label="Delete chat"
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
            onClick={() => navigate('/settings')}
            className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-colors cursor-pointer"
            aria-label="Settings"
          >
            <Settings className="w-4 h-4" />
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
