import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  Page,
  Masthead,
  MastheadMain,
  MastheadBrand,
  MastheadToggle,
  MastheadContent,
  PageSidebar,
  PageSidebarBody,
  PageToggleButton,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
  ToolbarGroup,
} from '@patternfly/react-core';
import { BarsIcon } from '@patternfly/react-icons';
import { RedHatLogo } from '../RedHatLogo';
import { Sidebar } from '../Sidebar';
import { KeyboardShortcutsDialog } from '../KeyboardShortcutsDialog';
import { ErrorBoundary } from '../ErrorBoundary';
import { SessionExpiredModal } from '../SessionExpiredModal';
import { DebugToggle } from '../DebugToggle';
import { useAppSelector, useAppDispatch } from '../../redux/hooks';
import {
  selectAllChats,
  selectStreamingState,
  addChat,
  deleteChat,
  updateChat,
  setChats,
  setLoadingThreads,
  setThreadsListHydrated,
  ChatItem,
} from '../../redux/slices/chats';
import { addToast } from '../../redux/slices/toasts';
import { updateProjectThreadCount } from '../../redux/slices/projects';
import { SidebarChatItem } from '../../types/chat';
import { chatStorage } from '../../services/chatStorage';
import { getAllThreadsByUserId, getThreadState, deleteThread, type Thread } from '../../services/agent-rest';
import { getProjects, getThreadsByProject } from '../../services/projects-api';
import { setAuthExpiredCallback } from '../../services/authenticated-fetch';
import { markChatAsClientCreated, isClientCreatedChat } from '../../services/newChatTracker';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { releaseStreamingManager } from '../../lib/streaming/streamingManagerRegistry';
import { useProjects } from '../../hooks/useProjects';
import type { RootState } from '../../redux/store';

function toSafeDate(value: unknown): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'string' && value) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function toSafeISOString(value: unknown): string {
  return toSafeDate(value).toISOString();
}

async function withProjectThreads(history: Thread[]): Promise<Thread[]> {
  try {
    const projects = await getProjects();
    const extras = (
      await Promise.allSettled(
        projects.map((p) => getThreadsByProject(p.project_id)),
      )
    ).flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    const byId = new Map(history.map((t) => [t.id, t]));
    for (const t of extras) {
      const prev = byId.get(t.id);
      if (!prev) {
        byId.set(t.id, t);
        continue;
      }
      byId.set(t.id, {
        ...prev,
        title: prev.title || t.title,
        updatedAt: t.updatedAt ?? prev.updatedAt,
        project_id: t.project_id ?? prev.project_id,
      });
    }
    return [...byId.values()];
  } catch {
    return history;
  }
}

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const dispatch = useAppDispatch();
  const chats = useAppSelector(selectAllChats);
  const branding = useAppSelector((state: RootState) => state.config.branding);
  const {
    sidebarProjects,
    createProject,
    updateProject,
    deleteProject,
    assignThreadToProject,
    unassignAllThreads,
  } = useProjects();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const chatsRef = useRef(chats);
  useEffect(() => { chatsRef.current = chats; }, [chats]);

  useEffect(() => {
    setAuthExpiredCallback(() => {
      setSessionExpired(true);
    });
    return () => {
      setAuthExpiredCallback(null);
    };
  }, []);

  const currentChatId = useMemo(() => {
    const match = /^\/chat\/([^/]+)/.exec(location.pathname);
    return match?.[1];
  }, [location.pathname]);

  const streamingState = useAppSelector((state) =>
    currentChatId ? selectStreamingState(state, currentChatId) : null,
  );
  const activeSubAgent = streamingState?.activeSubAgent ?? null;

  useEffect(() => {
    const loadedChats = chatStorage.loadChats();
    if (loadedChats.length > 0) {
      const mapped: ChatItem[] = loadedChats.map((c) => ({
        ...c,
        timestamp: toSafeISOString(c.timestamp),
        historicalActivities: c.historicalActivities ?? {},
        feedback: c.feedback ?? {},
      }));
      dispatch(setChats(mapped));
    }
    dispatch(setLoadingThreads(false));
  }, [dispatch]);

  useEffect(() => {
    async function loadUserHistory() {
      try {
        dispatch(setLoadingThreads(true));
        const history = await withProjectThreads(
          await getAllThreadsByUserId(window.USER_DATA.preferred_username || window.USER_DATA.sub),
        );

        const backendIds = new Set(history.map((t) => t.id));
        const local = chatsRef.current;

        const surviving = local.filter(
          (c) => backendIds.has(c.id) || isClientCreatedChat(c.id),
        );

        const backendTitleMap = new Map(
          history.filter((t) => t.title).map((t) => [t.id, t.title]),
        );
        const backendTimestampMap = new Map(
          history.reduce<[string, string][]>((acc, t) => {
            if (t.updatedAt) acc.push([t.id, t.updatedAt]);
            return acc;
          }, []),
        );

        const backendProjectMap = new Map(
          history.map((t) => [t.id, t.project_id ?? null] as const),
        );

        const survivingWithTitles = surviving.map((c) => {
          const backendTitle = backendTitleMap.get(c.id);
          const ts = backendTimestampMap.get(c.id);
          const updated = { ...c };
          if (backendTitle && (c.title === 'Chat' || c.title === 'New Chat')) {
            updated.title = backendTitle;
            updated.preview = backendTitle;
          }
          if (ts) {
            updated.timestamp = ts;
          }
          if (
            backendIds.has(c.id) &&
            backendProjectMap.has(c.id) &&
            c._prevProjectId === undefined
          ) {
            updated.project_id = backendProjectMap.get(c.id);
          }
          return updated;
        });

        const survivingIds = new Set(survivingWithTitles.map((c) => c.id));
        const added: ChatItem[] = history
          .filter((t) => !survivingIds.has(t.id))
          .map((t) => ({
            id: t.id,
            messages: [],
            title: t.title || 'Chat',
            preview: t.title || 'Chat',
            timestamp: t.updatedAt || new Date().toISOString(),
            historicalActivities: {},
            feedback: {},
            project_id: t.project_id ?? null,
          }));

        const reconciled = [...survivingWithTitles, ...added].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
        dispatch(setChats(reconciled));

        if (reconciled.length === 0) {
          chatStorage.clearChats();
        }

        // Pre-fetch most recent thread's messages (warm the cache)
        const topThread = reconciled.find((c) => c.messages.length === 0);
        if (topThread) {
          getThreadState(topThread.id).then((msgs) => {
            if (msgs.length > 0) {
              dispatch(updateChat({
                id: topThread.id,
                updates: {
                  messages: msgs,
                  title: (() => {
                    const first = msgs.find(m => m.type === 'human');
                    const content = first ? String(first.content) : '';
                    return content.length > 40 ? content.substring(0, 40) + '...' : content || topThread.title || 'Chat';
                  })(),
                },
              }));
            }
          }).catch(() => { /* pre-fetch is best-effort */ });
        }

        dispatch(setThreadsListHydrated(true));
      } catch (error) {
        console.error('Failed to load user history:', error);
        dispatch(addToast({ title: 'Failed to load chat history', variant: 'warning' }));
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
        timestamp: toSafeDate(chat.timestamp),
        preview:
          chat.messages.length > 0
            ? (chat.messages[0].content as string).substring(0, 60) + '...'
            : chat.preview,
        project_id: chat.project_id,
      })),
    [chats]
  );

  const handleSelectChat = (chatId: string) => navigate(`/chat/${chatId}`);

  const handleNewChat = useCallback((projectId?: string) => {
    // Only the per-project "+" control passes projectId. The sidebar
    // "New Chat" button always starts an unassigned conversation.
    const newChatId = uuidv4();
    markChatAsClientCreated(newChatId);
    const newChat: ChatItem = {
      id: newChatId,
      title: 'New Chat',
      timestamp: new Date().toISOString(),
      preview: 'Start a new conversation',
      messages: [],
      historicalActivities: {},
      feedback: {},
      project_id: projectId ?? null,
    };
    dispatch(addChat(newChat));
    if (projectId) {
      dispatch(updateProjectThreadCount({ projectId, delta: 1 }));
    }
    navigate(`/chat/${newChatId}`, { state: { newChat: true } });
  }, [dispatch, navigate]);

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      const chat = chats.find((c) => c.id === chatId);
      if (chat?.project_id) {
        dispatch(updateProjectThreadCount({ projectId: chat.project_id, delta: -1 }));
      }
      releaseStreamingManager(chatId);
      dispatch(deleteChat(chatId));
      chatStorage.clearChats();
      const remaining = chats.filter((c) => c.id !== chatId);
      const ok = await deleteThread(chatId).catch(() => false);
      if (ok) {
        dispatch(addToast({ title: 'Chat deleted', variant: 'success' }));
      } else {
        if (chat?.project_id) {
          dispatch(updateProjectThreadCount({ projectId: chat.project_id, delta: 1 }));
        }
        dispatch(addToast({ title: 'Chat cleared locally but server delete failed', variant: 'warning' }));
      }
      if (location.pathname === `/chat/${chatId}`) {
        navigate(remaining.length > 0 ? `/chat/${remaining[0].id}` : '/');
      }
    },
    [dispatch, chats, navigate, location.pathname]
  );

  const handleRenameChat = useCallback(
    (chatId: string, newTitle: string) => {
      dispatch(updateChat({ id: chatId, updates: { title: newTitle.trim() || 'Untitled Chat' } }));
    },
    [dispatch]
  );

  const handleDeleteProject = useCallback(
    async (projectId: string, options?: { keepThreads?: boolean }) => {
      const keepThreads = options?.keepThreads === true;
      const { ok, deletedThreadIds, missing } = await deleteProject(projectId, { keepThreads });
      if (!ok) {
        dispatch(addToast({ title: 'Failed to delete project', variant: 'danger' }));
        return false;
      }

      if (keepThreads) {
        dispatch(addToast({
          title: 'Project deleted. Conversations moved to Chats.',
          variant: 'success',
        }));
        if (location.pathname.startsWith(`/project/${projectId}`)) {
          navigate('/');
        }
        return true;
      }

      dispatch(addToast({ title: 'Project deleted', variant: 'success' }));
      if (missing) {
        for (const chat of chats) {
          if (chat.project_id === projectId) {
            dispatch(updateChat({ id: chat.id, updates: { project_id: null } }));
          }
        }
        if (location.pathname.startsWith(`/project/${projectId}`)) {
          navigate('/');
        }
        return true;
      }
      const localChatIds = chats
        .filter((c) => c.project_id === projectId)
        .map((c) => c.id);
      const allIds = new Set([...deletedThreadIds, ...localChatIds]);
      if (
        location.pathname.startsWith(`/project/${projectId}`) ||
        (currentChatId && allIds.has(currentChatId))
      ) {
        navigate('/');
      }
      for (const id of allIds) {
        releaseStreamingManager(id);
        dispatch(deleteChat(id));
      }
      const remaining = chats.filter((c) => !allIds.has(c.id));
      if (remaining.length === 0) {
        chatStorage.clearChats();
      } else {
        chatStorage.saveChats(remaining as any);
      }
      return true;
    },
    [deleteProject, dispatch, chats, navigate, location.pathname, currentChatId],
  );

  const handleUnassignAll = useCallback(
    async (projectId: string) => {
      const ok = await unassignAllThreads(projectId);
      if (ok) {
        dispatch(addToast({ title: 'Conversations moved to Chats', variant: 'success' }));
      } else {
        dispatch(addToast({ title: 'Failed to unassign conversations', variant: 'danger' }));
      }
      return ok;
    },
    [unassignAllThreads, dispatch],
  );

  useKeyboardShortcuts({
    onNewChat: () => navigate('/'),
    onOpenSettings: () => navigate('/settings'),
    onToggleHelp: () => setIsHelpOpen((v) => !v),
  });

  const masthead = (
    <Masthead display={{ default: 'inline' }} className="!bg-card !border-b !border-border">
      <MastheadToggle>
        <PageToggleButton
          variant="plain"
          aria-label="Toggle sidebar"
          isSidebarOpen={!sidebarCollapsed}
          onSidebarToggle={() => setSidebarCollapsed((prev) => !prev)}
          id="nav-toggle"
        >
          <BarsIcon />
        </PageToggleButton>
      </MastheadToggle>
      <MastheadMain>
        <MastheadBrand>
          <div className="flex items-center gap-2">
            {branding?.logo_url ? (
              <img
                src={branding.logo_url}
                alt={branding.title || 'Logo'}
                className="h-5 w-auto"
                style={{ height: '1.25rem', width: 'auto', maxHeight: '1.25rem' }}
              />
            ) : (
              <RedHatLogo className="h-5 w-auto" style={{ color: '#ee0000' }} />
            )}
            <span className="text-base font-semibold text-foreground">
              {branding?.title || window.APP_DATA?.agentName || 'Agent'}
            </span>
          </div>
        </MastheadBrand>
      </MastheadMain>
      <MastheadContent>
        <Toolbar id="masthead-toolbar" isFullHeight>
          <ToolbarContent>
            <ToolbarGroup align={{ default: 'alignEnd' }}>
              <ToolbarItem>
                <DebugToggle />
              </ToolbarItem>
            </ToolbarGroup>
          </ToolbarContent>
        </Toolbar>
      </MastheadContent>
    </Masthead>
  );

  const sidebar = (
    <PageSidebar isSidebarOpen={!sidebarCollapsed} aria-label="Sidebar navigation" role="navigation">
      <PageSidebarBody isFilled className="min-h-0">
        <ErrorBoundary
          onError={(error, errorInfo) => {
            console.error('Sidebar error:', error, errorInfo);
          }}
        >
          <Sidebar
            userName={userName}
            currentChatId={currentChatId}
            chatHistory={sidebarChats}
            tokenExpiry={tokenExpiry}
            activeSubAgent={activeSubAgent}
            onNewChat={handleNewChat}
            onSelectChat={handleSelectChat}
            onDeleteChat={handleDeleteChat}
            onRenameChat={handleRenameChat}
            projects={sidebarProjects}
            onCreateProject={createProject}
            onUpdateProject={updateProject}
            onDeleteProject={handleDeleteProject}
            onAssignThread={assignThreadToProject}
            onUnassignAll={handleUnassignAll}
          />
        </ErrorBoundary>
      </PageSidebarBody>
    </PageSidebar>
  );

  return (
    <Page masthead={masthead} sidebar={sidebar} className="h-screen bg-background text-foreground">
      <a href="#main-content" className="skip-to-main sr-only">
        Skip to main content
      </a>
      <KeyboardShortcutsDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      {/* PatternFly Modal traps focus and restores focus on close. */}
      <SessionExpiredModal isOpen={sessionExpired} />
      <ErrorBoundary
        onError={(error, errorInfo) => {
          console.error('Main content error:', error, errorInfo);
        }}
      >
        <main id="main-content" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </main>
      </ErrorBoundary>
    </Page>
  );
}
