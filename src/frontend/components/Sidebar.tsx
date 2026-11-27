import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownList,
  Label,
  MenuToggle,
  type MenuToggleElement,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalVariant,
  SearchInput,
  Tooltip,
} from '@patternfly/react-core';
import {
  Loader2,
  MessageSquare,
  Trash2,
  Edit3,
  Plus,
  Settings,
  LogOut,
  Folder,
  FolderPlus,
  FolderMinus,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { logout } from '../services/logout';
import { cn } from '@/lib/utils';
import type { SidebarChatItem, SidebarProject } from '../types/chat';
import type { SubAgentInfo } from '../types/deep-agent';
import { useAgentHealth } from '../hooks/useAgentHealth';
import { useSidebarDragDrop } from '../hooks/useSidebarDragDrop';
import { ProjectEditModal } from './ProjectEditModal';

interface SidebarProps {
  userName?: string;
  currentChatId?: string;
  chatHistory: SidebarChatItem[];
  tokenExpiry?: Date;
  activeSubAgent?: SubAgentInfo | null;
  onNewChat: (projectId?: string) => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  projects?: SidebarProject[];
  onCreateProject?: (name: string, description?: string) => Promise<string | null>;
  onUpdateProject?: (projectId: string, name?: string, description?: string) => Promise<boolean>;
  onDeleteProject?: (
    projectId: string,
    options?: { keepThreads?: boolean },
  ) => Promise<boolean>;
  onAssignThread?: (threadId: string, projectId: string | null) => Promise<boolean>;
  onUnassignAll?: (projectId: string) => Promise<boolean>;
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
  onRenameChat,
  projects = [],
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onAssignThread,
  onUnassignAll,
}: SidebarProps) {
  const navigate = useNavigate();
  const agentHealth = useAgentHealth();
  const [searchQuery, setSearchQuery] = useState('');
  const [editingChat, setEditingChat] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [unassigningProjectId, setUnassigningProjectId] = useState<string | null>(null);
  const [unassignBusy, setUnassignBusy] = useState(false);
  const [projectDeleteBusy, setProjectDeleteBusy] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<SidebarProject | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
  const [assignMenuChatId, setAssignMenuChatId] = useState<string | null>(null);

  const assignHandler = onAssignThread ?? (async () => false);
  const drag = useSidebarDragDrop(assignHandler);

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chatHistory;
    return chatHistory.filter(
      (chat) =>
        chat.title.toLowerCase().includes(q) || chat.preview.toLowerCase().includes(q)
    );
  }, [chatHistory, searchQuery]);

  const knownProjectIds = useMemo(
    () => new Set(projects.map((p) => p.id)),
    [projects],
  );

  const unassignedChats = useMemo(
    () =>
      filteredChats.filter(
        (c) => !c.project_id || !knownProjectIds.has(c.project_id),
      ),
    [filteredChats, knownProjectIds],
  );

  const chatsByProject = useMemo(() => {
    const map: Record<string, SidebarChatItem[]> = {};
    for (const chat of filteredChats) {
      if (chat.project_id && knownProjectIds.has(chat.project_id)) {
        (map[chat.project_id] ??= []).push(chat);
      }
    }
    return map;
  }, [filteredChats, knownProjectIds]);

  const isProjectExpanded = (projectId: string) => {
    if (expandedProjects[projectId] !== undefined) return expandedProjects[projectId];
    const chats = chatsByProject[projectId] ?? [];
    return chats.some((c) => c.id === currentChatId);
  };

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !isProjectExpanded(projectId),
    }));
  };

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

  const renderChatRow = (chat: SidebarChatItem) => {
    const isActive = currentChatId === chat.id;
    const isDragging = drag.draggedThreadId === chat.id;

    return (
      <li
        key={chat.id}
        draggable={editingChat !== chat.id}
        onDragStart={(e) => drag.handleDragStart(e, chat.id)}
        onDragEnd={drag.handleDragEnd}
        className={cn(
          'relative group rounded-lg transition-colors',
          isActive ? 'bg-secondary text-foreground' : 'hover:bg-secondary/50',
          isDragging && 'opacity-50',
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
              type="button"
              onClick={() => onSelectChat(chat.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'w-full text-left text-sm px-2.5 py-2 pr-24 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
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
              {onAssignThread &&
              chat.project_id &&
              knownProjectIds.has(chat.project_id) ? (
                <Button
                  variant="plain"
                  size="sm"
                  className="h-7 w-7 !p-0 text-muted-foreground hover:text-foreground focus-visible:opacity-100"
                  onClick={() => void onAssignThread(chat.id, null)}
                  aria-label={`Unassign chat: ${chat.title}`}
                >
                  <FolderMinus className="w-3 h-3" />
                </Button>
              ) : onAssignThread && projects.length > 0 ? (
                <Dropdown
                  isOpen={assignMenuChatId === chat.id}
                  onOpenChange={(open) => setAssignMenuChatId(open ? chat.id : null)}
                  onSelect={(_event, value) => {
                    if (typeof value === 'string') {
                      void onAssignThread(chat.id, value);
                    }
                    setAssignMenuChatId(null);
                  }}
                  popperProps={{ position: 'right' }}
                  toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
                    <MenuToggle
                      ref={toggleRef}
                      variant="plain"
                      onClick={() =>
                        setAssignMenuChatId((id) => (id === chat.id ? null : chat.id))
                      }
                      isExpanded={assignMenuChatId === chat.id}
                      aria-label={`Add to project: ${chat.title}`}
                      icon={<FolderPlus className="w-3 h-3" />}
                      className="h-7 w-7 !p-0 text-muted-foreground hover:text-foreground"
                    />
                  )}
                >
                  <DropdownList>
                    {projects.map((project) => (
                      <DropdownItem key={project.id} value={project.id}>
                        {project.name}
                      </DropdownItem>
                    ))}
                  </DropdownList>
                </Dropdown>
              ) : null}
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
  };

  const deletingThreadCount =
    projects.find((p) => p.id === deletingProjectId)?.threadCount ?? 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-sidebar border-r border-sidebar-border text-sidebar-foreground">
      <div className="shrink-0 p-3 pb-2">
        <Button variant="primary" isBlock onClick={() => onNewChat()} aria-label="Start new chat" icon={<Plus className="w-4 h-4" />}>
          New Chat
        </Button>
      </div>

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

      <div className="flex-1 min-h-0 overflow-y-auto chat-scroll">
        <div className="shrink-0 px-3 pt-3 pb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Projects</p>
          {onCreateProject && (
            <Button
              variant="plain"
              size="sm"
              className="h-6 w-6 !p-0 text-muted-foreground hover:text-foreground"
              onClick={() => {
                setEditingProject(null);
                setProjectModalOpen(true);
              }}
              aria-label="Create project"
            >
              <FolderPlus className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>

        {projects.length === 0 ? (
          <p className="px-3 pb-2 text-xs text-muted-foreground">No projects yet</p>
        ) : (
          <ul className="px-1.5 space-y-0.5 list-none mb-2" aria-label="Projects">
            {projects.map((project) => {
              const expanded = isProjectExpanded(project.id);
              const projectChats = chatsByProject[project.id] ?? [];
              const isDropTarget = drag.dragOverTarget === project.id;
              return (
                <li key={project.id}>
                  <div
                    onDragOver={(e) => drag.handleDragOver(e, project.id)}
                    onDragLeave={drag.handleDragLeave}
                    onDrop={(e) => void drag.handleDrop(e, project.id)}
                    className={cn(
                      'rounded-lg transition-colors',
                      isDropTarget && 'ring-2 ring-primary/50 bg-primary/5',
                    )}
                  >
                    <div className="group relative flex items-center">
                      <button
                        type="button"
                        onClick={() => toggleProject(project.id)}
                        className="shrink-0 p-1.5 text-muted-foreground hover:text-foreground"
                        aria-expanded={expanded}
                        aria-label={`${expanded ? 'Collapse' : 'Expand'} ${project.name}`}
                      >
                        {expanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/project/${project.id}`)}
                        className="flex-1 min-w-0 flex items-center gap-1.5 py-1.5 pr-24 text-left text-sm hover:text-foreground"
                      >
                        <Folder className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{project.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {project.threadCount}
                        </span>
                      </button>
                      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        <Button
                          variant="plain"
                          size="sm"
                          className="h-6 w-6 !p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => onNewChat(project.id)}
                          aria-label={`New chat in ${project.name}`}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                        {onUnassignAll && project.threadCount > 0 && (
                          <Button
                            variant="plain"
                            size="sm"
                            className="h-6 w-6 !p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => setUnassigningProjectId(project.id)}
                            aria-label={`Unassign all chats from ${project.name}`}
                          >
                            <FolderMinus className="w-3 h-3" />
                          </Button>
                        )}
                        {onUpdateProject && (
                          <Button
                            variant="plain"
                            size="sm"
                            className="h-6 w-6 !p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setEditingProject(project);
                              setProjectModalOpen(true);
                            }}
                            aria-label={`Edit project: ${project.name}`}
                          >
                            <Edit3 className="w-3 h-3" />
                          </Button>
                        )}
                        {onDeleteProject && (
                          <Button
                            variant="plain"
                            size="sm"
                            className="h-6 w-6 !p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeletingProjectId(project.id)}
                            aria-label={`Delete project: ${project.name}`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {expanded && (
                      <div
                        className="border-s border-sidebar-border/80"
                        style={{
                          marginInlineStart: '1.75rem',
                          paddingInlineStart: '0.5rem',
                        }}
                      >
                        <ul
                          className="pb-1 space-y-0.5 list-none max-h-48 overflow-y-auto chat-scroll"
                          aria-label={`${project.name} chats`}
                        >
                          {projectChats.length === 0 ? (
                            <li className="px-2.5 py-1 text-xs text-muted-foreground">No chats</li>
                          ) : (
                            projectChats.map((chat) => renderChatRow(chat))
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <div
          onDragOver={(e) => drag.handleDragOver(e, 'unassigned')}
          onDragLeave={drag.handleDragLeave}
          onDrop={(e) => void drag.handleDrop(e, null)}
          className={cn(
            'rounded-lg mx-1.5 transition-colors',
            drag.dragOverTarget === 'unassigned' && 'ring-2 ring-primary/50 bg-primary/5',
          )}
        >
          <div className="shrink-0 px-1.5 pt-3 pb-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Chats</p>
          </div>

          {unassignedChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <MessageSquare className="w-6 h-6 text-muted-foreground/40 mb-2" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">
                {chatHistory.length === 0 ? 'No chats yet' : 'No unassigned chats'}
              </p>
            </div>
          ) : (
            <ul
              aria-label="Chat history"
              className="px-0 space-y-0.5 list-none pb-2"
            >
              {unassignedChats.map((chat) => renderChatRow(chat))}
            </ul>
          )}
        </div>
      </div>

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

      <Modal
        variant={ModalVariant.small}
        isOpen={deletingProjectId !== null}
        onClose={() => {
          if (!projectDeleteBusy) setDeletingProjectId(null);
        }}
        aria-label="Delete project confirmation"
      >
        <ModalHeader title="Delete project" />
        <ModalBody>
          Delete this project and all of its conversations? This cannot be undone.
          {deletingThreadCount > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              To keep the conversations, use Unassign and delete — they will move to Chats.
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          {deletingThreadCount > 0 && (
            <Button
              variant="secondary"
              isDisabled={projectDeleteBusy}
              onClick={() => {
                if (!deletingProjectId) return;
                void (async () => {
                  setProjectDeleteBusy(true);
                  try {
                    const ok = await onDeleteProject?.(deletingProjectId, {
                      keepThreads: true,
                    });
                    if (ok) setDeletingProjectId(null);
                  } finally {
                    setProjectDeleteBusy(false);
                  }
                })();
              }}
            >
              Unassign and delete
            </Button>
          )}
          <Button
            variant="danger"
            isDisabled={projectDeleteBusy}
            onClick={() => {
              if (!deletingProjectId) return;
              void (async () => {
                setProjectDeleteBusy(true);
                try {
                  const ok = await onDeleteProject?.(deletingProjectId);
                  if (ok) setDeletingProjectId(null);
                } finally {
                  setProjectDeleteBusy(false);
                }
              })();
            }}
          >
            Delete
          </Button>
          <Button
            variant="link"
            isDisabled={projectDeleteBusy}
            onClick={() => setDeletingProjectId(null)}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        variant={ModalVariant.small}
        isOpen={unassigningProjectId !== null}
        onClose={() => {
          if (!unassignBusy) setUnassigningProjectId(null);
        }}
        aria-label="Unassign all conversations confirmation"
      >
        <ModalHeader title="Unassign all conversations" />
        <ModalBody>Move every conversation in this project back to Chats?</ModalBody>
        <ModalFooter>
          <Button
            variant="danger"
            isDisabled={unassignBusy}
            onClick={() => {
              if (!unassigningProjectId || !onUnassignAll) return;
              void (async () => {
                setUnassignBusy(true);
                try {
                  const ok = await onUnassignAll(unassigningProjectId);
                  if (ok) setUnassigningProjectId(null);
                } finally {
                  setUnassignBusy(false);
                }
              })();
            }}
          >
            Unassign
          </Button>
          <Button
            variant="link"
            isDisabled={unassignBusy}
            onClick={() => setUnassigningProjectId(null)}
          >
            Cancel
          </Button>
        </ModalFooter>
      </Modal>

      <ProjectEditModal
        isOpen={projectModalOpen}
        onClose={() => {
          setProjectModalOpen(false);
          setEditingProject(null);
        }}
        title={editingProject ? 'Edit Project' : 'New Project'}
        initialName={editingProject?.name ?? ''}
        initialDescription={editingProject?.description ?? ''}
        onSave={async (name, description) => {
          const taken = projects.some(
            (p) =>
              p.name.trim().toLowerCase() === name.toLowerCase() &&
              p.id !== editingProject?.id,
          );
          if (taken) return false;

          try {
            if (editingProject) {
              const ok = await onUpdateProject?.(editingProject.id, name, description);
              return ok !== false;
            }
            const id = await onCreateProject?.(name, description);
            if (!id) return false;
            setExpandedProjects((prev) => ({ ...prev, [id]: true }));
            navigate(`/project/${id}`);
            return true;
          } catch {
            return 'error';
          }
        }}
      />
    </div>
  );
}

export const Sidebar = React.memo(SidebarComponent);
