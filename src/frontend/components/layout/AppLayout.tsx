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
  clearAllChats,
  updateChat,
  setChats,
  setLoadingThreads,
  setThreadsListHydrated,
  ChatItem,
} from '../../redux/slices/chats';
import { addToast } from '../../redux/slices/toasts';
import { SidebarChatItem } from '../../types/chat';
import { chatStorage } from '../../services/chatStorage';
import { getAllThreadsByUserId, getThreadState, deleteThread } from '../../services/agent-rest';
import { setAuthExpiredCallback } from '../../services/authenticated-fetch';
import { markChatAsClientCreated, isClientCreatedChat } from '../../services/newChatTracker';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { releaseStreamingManager } from '../../lib/streaming/streamingManagerRegistry';
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

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const dispatch = useAppDispatch();
  const chats = useAppSelector(selectAllChats);
  const branding = useAppSelector((state: RootState) => state.config.branding);
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
        const history = await getAllThreadsByUserId(window.USER_DATA.preferred_username || window.USER_DATA.sub);

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
      })),
    [chats]
  );

  const handleSelectChat = (chatId: string) => navigate(`/chat/${chatId}`);

  const handleNewChat = useCallback(() => {
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
    };
    dispatch(addChat(newChat));
    navigate(`/chat/${newChatId}`, { state: { newChat: true } });
  }, [dispatch, navigate]);

  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      releaseStreamingManager(chatId);
      dispatch(deleteChat(chatId));
      chatStorage.clearChats();
      const remaining = chats.filter((c) => c.id !== chatId);
      const ok = await deleteThread(chatId).catch(() => false);
      if (ok) {
        dispatch(addToast({ title: 'Chat deleted', variant: 'success' }));
      } else {
        dispatch(addToast({ title: 'Chat cleared locally but server delete failed', variant: 'warning' }));
      }
      if (location.pathname === `/chat/${chatId}`) {
        navigate(remaining.length > 0 ? `/chat/${remaining[0].id}` : '/');
      }
    },
    [dispatch, chats, navigate, location.pathname]
  );

  const handleDeleteAllChats = useCallback(async () => {
    const ids = chats.map((c) => c.id);
    ids.forEach((id) => releaseStreamingManager(id));
    dispatch(clearAllChats());
    chatStorage.clearChats();
    const results = await Promise.all(ids.map((id) => deleteThread(id).catch(() => false)));
    const failures = results.filter((r) => !r).length;
    if (failures > 0 && failures < ids.length) {
      dispatch(addToast({ title: `${ids.length - failures} chats deleted, ${failures} failed on server`, variant: 'warning' }));
    } else if (failures === ids.length) {
      dispatch(addToast({ title: 'Chats cleared locally but server deletion failed', variant: 'warning' }));
    } else {
      dispatch(addToast({ title: 'All chats deleted', variant: 'success' }));
    }
    navigate('/');
  }, [dispatch, chats, navigate]);

  const handleRenameChat = useCallback(
    (chatId: string, newTitle: string) => {
      dispatch(updateChat({ id: chatId, updates: { title: newTitle.trim() || 'Untitled Chat' } }));
    },
    [dispatch]
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
            onDeleteAllChats={handleDeleteAllChats}
            onRenameChat={handleRenameChat}
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
