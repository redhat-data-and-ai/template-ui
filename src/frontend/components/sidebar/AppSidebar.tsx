import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Button,
  Nav,
  NavList,
  PageSidebar,
  PageSidebarBody,
  SearchInput,
} from "@patternfly/react-core";
import { PlusIcon } from "@patternfly/react-icons";
import type { SidebarChatItem, SidebarProject } from "../../types/chat";
import type { SubAgentInfo } from "../../types/deep-agent";
import { useSidebarDragDrop } from "../../hooks/useSidebarDragDrop";
import { ProjectEditModal } from "../ProjectEditModal";
import { ChatList, type ChatRowContext } from "./ChatList";
import { ProjectList } from "./ProjectList";
import { SidebarDialogs } from "./SidebarDialogs";
import { SidebarFooter } from "./SidebarFooter";

export interface AppSidebarProps {
  isOpen: boolean;
  currentChatId?: string;
  chatHistory: SidebarChatItem[];
  tokenExpiry?: Date;
  activeSubAgent?: SubAgentInfo | null;
  onNewChat: (projectId?: string) => void;
  onSelectChat: (chatId: string) => void;
  onDeleteChat: (chatId: string) => void;
  onRenameChat: (chatId: string, newTitle: string) => void;
  projects?: SidebarProject[];
  onCreateProject?: (
    name: string,
    description?: string,
  ) => Promise<string | null>;
  onUpdateProject?: (
    projectId: string,
    name?: string,
    description?: string,
  ) => Promise<boolean>;
  onDeleteProject?: (
    projectId: string,
    options?: { keepThreads?: boolean },
  ) => Promise<boolean>;
  onAssignThread?: (
    threadId: string,
    projectId: string | null,
  ) => Promise<boolean>;
  onUnassignAll?: (projectId: string) => Promise<boolean>;
}

function AppSidebarComponent({
  isOpen,
  currentChatId,
  chatHistory,
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
}: AppSidebarProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [editingChat, setEditingChat] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingChatId, setDeletingChatId] = useState<string | null>(null);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(
    null,
  );
  const [unassigningProjectId, setUnassigningProjectId] = useState<
    string | null
  >(null);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<SidebarProject | null>(
    null,
  );
  const [expandedProjects, setExpandedProjects] = useState<
    Record<string, boolean>
  >({});

  const assignHandler = onAssignThread ?? (async () => false);
  const drag = useSidebarDragDrop(assignHandler);

  const filteredChats = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return chatHistory;
    return chatHistory.filter(
      (chat) =>
        chat.title.toLowerCase().includes(q) ||
        chat.preview.toLowerCase().includes(q),
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
    if (expandedProjects[projectId] !== undefined)
      return expandedProjects[projectId];
    return (chatsByProject[projectId] ?? []).some(
      (c) => c.id === currentChatId,
    );
  };

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !isProjectExpanded(projectId),
    }));
  };

  const saveRename = (chatId: string) => {
    const trimmed = editTitle.trim();
    if (trimmed) onRenameChat(chatId, trimmed);
    setEditingChat(null);
    setEditTitle("");
  };

  const rowContext: ChatRowContext = {
    currentChatId,
    activeSubAgent,
    projects,
    knownProjectIds,
    editingChat,
    editTitle,
    setEditTitle,
    startRename: (chatId, title) => {
      setEditingChat(chatId);
      setEditTitle(title);
    },
    saveRename,
    cancelRename: () => {
      setEditingChat(null);
      setEditTitle("");
    },
    requestDelete: setDeletingChatId,
    onSelectChat,
    onAssignThread,
    drag,
  };

  const deletingThreadCount =
    projects.find((p) => p.id === deletingProjectId)?.threadCount ?? 0;

  return (
    <PageSidebar isSidebarOpen={isOpen} id="app-sidebar" inert={!isOpen}>
      <PageSidebarBody isFilled className="app-sidebar-body">
        {/* One navigation landmark for the whole sidebar body (search and footer included). */}
        <Nav aria-label="Chats" className="app-sidebar-nav">
          <div className="app-sidebar-top">
            <Button
              variant="primary"
              isBlock
              icon={<PlusIcon />}
              onClick={() => onNewChat()}
            >
              New Chat
            </Button>
            {chatHistory.length > 3 && (
              <SearchInput
                placeholder="Search threads"
                aria-label="Search chat threads"
                value={searchQuery}
                onChange={(_e, value) => setSearchQuery(value)}
              />
            )}
          </div>

          <div className="app-sidebar-scroll chat-scroll">
            <NavList>
              <ProjectList
                projects={projects}
                chatsByProject={chatsByProject}
                isProjectExpanded={isProjectExpanded}
                onToggleProject={toggleProject}
                ctx={rowContext}
                onNewProject={
                  onCreateProject
                    ? () => {
                        setEditingProject(null);
                        setProjectModalOpen(true);
                      }
                    : undefined
                }
                onNewChatInProject={(projectId) => onNewChat(projectId)}
                onEditProject={
                  onUpdateProject
                    ? (project) => {
                        setEditingProject(project);
                        setProjectModalOpen(true);
                      }
                    : undefined
                }
                onDeleteProject={
                  onDeleteProject ? setDeletingProjectId : undefined
                }
                onUnassignAll={
                  onUnassignAll ? setUnassigningProjectId : undefined
                }
              />
              <ChatList
                chats={unassignedChats}
                hasAnyChats={chatHistory.length > 0}
                ctx={rowContext}
              />
            </NavList>
          </div>

          <SidebarFooter />
        </Nav>
      </PageSidebarBody>

      <SidebarDialogs
        deletingChatId={deletingChatId}
        onCloseDeleteChat={() => setDeletingChatId(null)}
        onDeleteChat={onDeleteChat}
        deletingProjectId={deletingProjectId}
        deletingThreadCount={deletingThreadCount}
        onCloseDeleteProject={() => setDeletingProjectId(null)}
        onDeleteProject={onDeleteProject}
        unassigningProjectId={unassigningProjectId}
        onCloseUnassign={() => setUnassigningProjectId(null)}
        onUnassignAll={onUnassignAll}
      />

      <ProjectEditModal
        isOpen={projectModalOpen}
        onClose={() => {
          setProjectModalOpen(false);
          setEditingProject(null);
        }}
        title={editingProject ? "Edit Project" : "New Project"}
        initialName={editingProject?.name ?? ""}
        initialDescription={editingProject?.description ?? ""}
        onSave={async (name, description) => {
          const taken = projects.some(
            (p) =>
              p.name.trim().toLowerCase() === name.toLowerCase() &&
              p.id !== editingProject?.id,
          );
          if (taken) return false;

          try {
            if (editingProject) {
              const ok = await onUpdateProject?.(
                editingProject.id,
                name,
                description,
              );
              return ok !== false;
            }
            const id = await onCreateProject?.(name, description);
            if (!id) return false;
            setExpandedProjects((prev) => ({ ...prev, [id]: true }));
            navigate(`/project/${id}`);
            return true;
          } catch {
            return "error";
          }
        }}
      />
    </PageSidebar>
  );
}

export const AppSidebar = React.memo(AppSidebarComponent);
