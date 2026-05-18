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

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const dispatch = useAppDispatch();
  const chats = useAppSelector(selectAllChats);
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
        timestamp:
          typeof c.timestamp === 'string'
            ? c.timestamp
            : new Date(c.timestamp ?? Date.now()).toISOString(),
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
        const history = await getAllThreadsByUserId(window.USER_DATA.preferred_username);

        const backendIds = new Set(history.map((t) => t.id));
        const local = chatsRef.current;

        const surviving = local.filter(
          (c) => backendIds.has(c.id) || isClientCreatedChat(c.id),
        );

        const backendTitleMap = new Map(
          history.filter((t) => t.title).map((t) => [t.id, t.title]),
        );
        const backendTimestampMap = new Map(
          history.map((t) => [t.id, t.updatedAt || '']),
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
        timestamp: new Date(chat.timestamp),
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
    (chatId: string) => {
      dispatch(deleteChat(chatId));
      dispatch(addToast({ title: 'Chat deleted', variant: 'success' }));
      if (window.location.pathname === `/chat/${chatId}`) {
        const remaining = chats.filter((c) => c.id !== chatId);
        navigate(remaining.length > 0 ? `/chat/${remaining[0].id}` : '/');
      }
      deleteThread(chatId).catch(() => {});
    },
    [dispatch, chats, navigate]
  );

  const handleDeleteAllChats = useCallback(() => {
    const ids = chats.map((c) => c.id);
    dispatch(clearAllChats());
    chatStorage.clearChats();
    dispatch(addToast({ title: 'All chats deleted', variant: 'success' }));
    navigate('/');
    ids.forEach((id) => deleteThread(id).catch(() => {}));
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
            <RedHatLogo className="h-5 w-auto" style={{ color: '#ee0000' }} />
            <span className="text-base font-semibold text-foreground">
              {window.APP_DATA?.agentName || 'Agent'}
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
    <PageSidebar isSidebarOpen={!sidebarCollapsed} aria-label="Sidebar navigation">
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
        <div id="main-content" aria-label="Chat content" className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </div>
      </ErrorBoundary>
    </Page>
  );
}
