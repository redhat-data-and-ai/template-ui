import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { Message } from '@langchain/langgraph-sdk';
import { Button, Spinner } from '@patternfly/react-core';

import { useAppSelector, useAppDispatch } from '../redux/hooks';
import {
  selectChatById,
  selectIsLoadingThreads,
  selectChatsError,
  selectStreamingState,
  setMessageFeedback,
  updateChat,
  updateStreamingState,
} from '../redux/slices/chats';
import { selectDebugMode, addAlwaysAllowedTool, selectAutoApproveAllTools } from '../redux/slices/userSettings';
import { addToast } from '../redux/slices/toasts';
import { useStreamingAPI, MAX_RETRIES } from '../hooks/useStreamingAPI';
import { useRateLimitState } from '../hooks/useRateLimitState';
import { ChatMessagesView } from '../components/ChatMessagesView';
import { ChatErrorBoundary } from '../components/ChatErrorBoundary';
import { ReconnectingBanner } from '../components/ReconnectingBanner';
import { InterruptBanner } from '../components/InterruptBanner';
import { TaskProgressStepper } from '../components/TaskProgressStepper';
import { TasksSidebar } from '../components/TasksSidebar';
import { DebugPanel } from '../components/DebugPanel';
import { ProcessedEvent } from '../components/ActivityTimeline';
import { getThreadStateAndInterrupt } from '../services/agent-rest';
import { isClientCreatedChat } from '../services/newChatTracker';
import { getThreadFeedback } from '../services/feedback-api';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useAgentHealth } from '../hooks/useAgentHealth';
import {
  downloadFile,
  exportAsJSON,
  exportAsMarkdown,
  slugifyExportBase,
} from '../services/export-chat';
import {
  ChatActionsProvider,
  type McpModelContextUpdate,
} from '../contexts/ChatActionsContext';
import { formatMcpModelContext } from '../types/mcp-apps';

export function ChatPage({ threadId }: { threadId: string }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const currentChat = useAppSelector((state) => selectChatById(state, threadId));
  const chatsLoading = useAppSelector(selectIsLoadingThreads);
  const error = useAppSelector(selectChatsError);
  const debugMode = useAppSelector(selectDebugMode);
  const streamingState = useAppSelector((state) => selectStreamingState(state, threadId));
  const agentHealth = useAgentHealth();
  const prevHealthRef = useRef(agentHealth.status);
  const hasBeenHealthyRef = useRef(false);

  const [processedEventsTimeline, setProcessedEventsTimeline] = useState<ProcessedEvent[]>([]);
  const [historicalActivities, setHistoricalActivities] = useState<Record<string, ProcessedEvent[]>>({});
  const [hydrating, setHydrating] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const hasFinalizeEventOccurredRef = useRef(false);

  const thread = useStreamingAPI(threadId);
  const rateLimit = useRateLimitState();

  const [streamAnnouncement, setStreamAnnouncement] = useState('');
  const prevIsLoadingForAnnounce = useRef<boolean | null>(null);

  useEffect(() => {
    if (chatsLoading || hydrating) return;
    const t = requestAnimationFrame(() => {
      chatInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(t);
  }, [threadId, chatsLoading, hydrating]);

  useEffect(() => {
    if (chatsLoading || hydrating) return;
    const prev = prevIsLoadingForAnnounce.current;
    prevIsLoadingForAnnounce.current = thread.isLoading;
    if (prev === null) return;
    if (thread.isLoading && !prev) {
      setStreamAnnouncement('Agent is thinking');
    } else if (!thread.isLoading && prev) {
      setStreamAnnouncement(streamingState.error ? 'Stream error' : 'Response complete');
    }
  }, [thread.isLoading, streamingState.error, chatsLoading, hydrating]);

  const chatId = currentChat?.id;
  const hasMessages = currentChat && currentChat.messages.length > 0;

  const feedbackUserId = useMemo(() => {
    if (typeof window === 'undefined') return 'anonymous';
    const u = window.USER_DATA?.preferred_username || window.USER_DATA?.sub;
    return typeof u === 'string' && u.length > 0 ? u : 'anonymous';
  }, []);

  const hasStreamError = !!streamingState.error;
  const isNotStreaming = !streamingState.isLoading;
  const needsServerRefresh = hasMessages && hasStreamError && isNotStreaming;

  useEffect(() => {
    if (!chatId || hydrating) return;
    if (hasMessages && !needsServerRefresh) return;

    const locState = location.state as Record<string, unknown> | null;
    if (locState?.initialPrompt != null) return;
    if (isClientCreatedChat(chatId)) return;

    let cancelled = false;
    setHydrating(true);

    const threadPromise = getThreadStateAndInterrupt(chatId);
    const feedbackPromise = getThreadFeedback(chatId, feedbackUserId);

    Promise.all([threadPromise, feedbackPromise])
      .then(([{ messages: msgs, interrupt: pendingInterrupt }, feedbackMap]) => {
        if (cancelled) return;
        if (msgs.length > 0) {
          dispatch(updateChat({
            id: chatId,
            updates: {
              messages: msgs,
              title: (() => {
                const first = msgs.find(m => m.type === 'human');
                const content = first ? String(first.content) : '';
                return content.length > 40 ? content.substring(0, 40) + '...' : content || 'Chat';
              })(),
            },
          }));
          thread.setMessages(msgs.map(m => JSON.parse(JSON.stringify(m))));
          if (needsServerRefresh) {
            dispatch(updateStreamingState({
              chatId,
              state: { error: null, isLoading: false, isConnected: false },
            }));
          }
        }
        if (Object.keys(feedbackMap).length > 0) {
          for (const [msgId, fb] of Object.entries(feedbackMap)) {
            dispatch(setMessageFeedback({ chatId, messageId: msgId, feedback: fb }));
          }
        }
        if (pendingInterrupt) {
          dispatch(updateStreamingState({
            chatId,
            state: {
              pendingInterrupt: {
                value: pendingInterrupt.value as any,
                resumable: pendingInterrupt.resumable,
              },
            },
          }));
        }
        setHydrating(false);
      })
      .catch(() => {
        if (!cancelled) setHydrating(false);
      });

    return () => { cancelled = true; setHydrating(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, feedbackUserId, needsServerRefresh]);

  useEffect(() => {
    if (!chatId || isClientCreatedChat(chatId)) return;
    let cancelled = false;
    getThreadFeedback(chatId, feedbackUserId).then((feedbackMap) => {
      if (cancelled) return;
      for (const [msgId, fb] of Object.entries(feedbackMap)) {
        dispatch(setMessageFeedback({ chatId, messageId: msgId, feedback: fb }));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, feedbackUserId]);

  const initialPromptSent = useRef(false);
  useEffect(() => {
    const prompt = (location.state as any)?.initialPrompt;
    if (!prompt || initialPromptSent.current || hydrating || thread.isLoading) return;
    if (!currentChat || currentChat.messages.length > 0) return;

    initialPromptSent.current = true;
    navigate(location.pathname, { replace: true, state: {} });

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      type: 'human',
      content: prompt,
    };
    thread.submit({ messages: [userMessage] }).then(() => {
      hasFinalizeEventOccurredRef.current = true;
    }).catch((err) => {
      console.error('Failed to auto-send initial prompt:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, hydrating, thread.isLoading]);

  useEffect(() => {
    if (currentChat && currentChat.messages.length > 0 && !thread.isLoading && !hydrating) {
      thread.setMessages(currentChat.messages.map(m => JSON.parse(JSON.stringify(m))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, hasMessages]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const el = scrollAreaRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [thread.messages]);

  const previousMessagesLength = useRef(0);
  useEffect(() => {
    if (threadId && thread.messages.length > 0 && thread.messages.length !== previousMessagesLength.current) {
      if (currentChat?.title === 'New Chat' && thread.messages.length > 0) {
        const content = thread.messages[0].content as string;
        dispatch(updateChat({
          id: threadId,
          updates: {
            title: content.length > 40 ? content.substring(0, 40) + '...' : content || 'New Chat',
            preview: content.substring(0, 60) + '...',
            timestamp: new Date().toISOString(),
          },
        }));
      }
      previousMessagesLength.current = thread.messages.length;
    }
  }, [threadId, thread.messages, dispatch, currentChat]);

  useEffect(() => {
    if (
      hasFinalizeEventOccurredRef.current &&
      !thread.isLoading &&
      thread.messages.length > 0 &&
      threadId
    ) {
      const lastMessage = thread.messages[thread.messages.length - 1];
      if (lastMessage?.type === 'ai' && lastMessage.id) {
        dispatch(
          updateChat({
            id: threadId,
            updates: {
              historicalActivities: {
                ...currentChat?.historicalActivities,
                [lastMessage.id]: [...processedEventsTimeline],
              },
            },
          })
        );
      }
      hasFinalizeEventOccurredRef.current = false;
    }
  }, [thread.isLoading, threadId, dispatch, thread.messages, processedEventsTimeline, currentChat]);

  // Last ui/update-model-context snapshot for the next turn (not shown in the chat bubble).
  const pendingMcpModelContextRef = useRef<string | null>(null);
  const threadRef = useRef(thread);
  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);

  const setMcpModelContext = useCallback((update: McpModelContextUpdate | null) => {
    pendingMcpModelContextRef.current = formatMcpModelContext(update);
  }, []);

  const handleSubmit = useCallback(
    async (inputValue: string) => {
      if (!threadId || !currentChat) return;

      const trimmed = inputValue.trim();
      if (!trimmed) return;

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        type: 'human',
        content: trimmed,
      };

      const currentThread = threadRef.current;
      const messages = [...currentThread.messages, userMessage];
      const mcpModelContext = pendingMcpModelContextRef.current;

      try {
        await currentThread.submit({ messages, mcpModelContext });
        // Clear only if still the same snapshot — a newer ui/update-model-context
        // may have arrived while submit awaited.
        if (pendingMcpModelContextRef.current === mcpModelContext) {
          pendingMcpModelContextRef.current = null;
        }
        setTimeout(() => {
          hasFinalizeEventOccurredRef.current = true;
        }, 100);
      } catch (err) {
        console.error('Failed to submit message:', err);
        dispatch(addToast({ title: 'Failed to send message', message: 'Please try again.', variant: 'danger' }));
      }
    },
    [threadId, currentChat, dispatch]
  );

  const chatActions = useMemo(
    () => ({
      sendUserMessage: handleSubmit,
      setMcpModelContext,
    }),
    [handleSubmit, setMcpModelContext],
  );

  const handleCancel = useCallback(() => {
    thread.stop();
  }, [thread]);

  const handleEditMessage = useCallback(
    async (messageIndex: number, newContent: string) => {
      if (!threadId || !currentChat) return;
      const trimmed = newContent.trim();
      if (trimmed === '') return;

      const truncated = thread.messages.slice(0, messageIndex);
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        type: 'human',
        content: trimmed,
      };
      const nextMessages = [...truncated, userMessage];

      try {
        await thread.submit({ messages: nextMessages });
        setTimeout(() => {
          hasFinalizeEventOccurredRef.current = true;
        }, 100);
      } catch (err) {
        console.error('Failed to edit message:', err);
        dispatch(addToast({ title: 'Failed to send edited message', message: 'Please try again.', variant: 'danger' }));
      }
    },
    [thread, threadId, currentChat, dispatch],
  );

  const handleRetry = useCallback(() => {
    setProcessedEventsTimeline([]);
    setHistoricalActivities(currentChat?.historicalActivities || {});
  }, [currentChat]);

  const handleStreamRetry = useCallback(async () => {
    if (!threadId || !currentChat) return;
    const currentThread = threadRef.current;
    if (currentThread.messages.length === 0) return;
    const mcpModelContext = pendingMcpModelContextRef.current;
    try {
      await currentThread.submit({ messages: currentThread.messages, mcpModelContext });
      if (pendingMcpModelContextRef.current === mcpModelContext) {
        pendingMcpModelContextRef.current = null;
      }
      setTimeout(() => {
        hasFinalizeEventOccurredRef.current = true;
      }, 100);
    } catch (err) {
      console.error('Failed to retry:', err);
      dispatch(addToast({ title: 'Failed to retry', message: 'Please try again.', variant: 'danger' }));
    }
  }, [threadId, currentChat, dispatch]);

  const handleInterruptResume = useCallback(
    async (decisions: Array<{ type: 'approve' | 'reject'; message?: string }>) => {
      if (!threadId || !currentChat) return;
      try {
        await thread.resumeWithDecisions(decisions);
        setTimeout(() => {
          hasFinalizeEventOccurredRef.current = true;
        }, 100);
      } catch (err) {
        console.error('Failed to resume:', err);
        dispatch(addToast({ title: 'Failed to resume', variant: 'danger' }));
      }
    },
    [thread, threadId, currentChat, dispatch],
  );

  const handleMCPOAuthResume = useCallback(
    async (response: string) => {
      if (!threadId || !currentChat) return;
      try {
        await thread.resumeInterrupt(response);
        setTimeout(() => {
          hasFinalizeEventOccurredRef.current = true;
        }, 100);
      } catch (err) {
        console.error('Failed to resume:', err);
        dispatch(addToast({ title: 'Failed to resume', variant: 'danger' }));
      }
    },
    [thread, threadId, currentChat, dispatch],
  );

  const handleInterruptDismiss = useCallback(() => {
    dispatch(
      updateStreamingState({
        chatId: threadId,
        state: { pendingInterrupt: null },
      }),
    );
  }, [dispatch, threadId]);

  const handleAlwaysAllow = useCallback(
    (toolNames: string[]) => {
      for (const name of toolNames) {
        dispatch(addAlwaysAllowedTool(name));
      }
    },
    [dispatch],
  );

  const autoApproveAllTools = useAppSelector(selectAutoApproveAllTools);
  useEffect(() => {
    const interrupt = thread.pendingInterrupt;
    if (typeof interrupt?.value !== 'object' || !interrupt.value.action_requests?.length) return;

    if (autoApproveAllTools) {
      const allApproved = interrupt.value.action_requests.map(() => ({ type: 'approve' as const }));
      thread.resumeWithDecisions(allApproved).catch((err) => {
        console.error('Auto-approve-all resume failed:', err);
      });
      return;
    }

    const { allAutoApproved, decisions } = thread.checkAndAutoApprove(interrupt.value);
    if (!allAutoApproved) return;
    thread.resumeWithDecisions(decisions).catch((err) => {
      console.error('Auto-approve resume failed:', err);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.pendingInterrupt, autoApproveAllTools]);

  // Replay queued HITL decisions when agent recovers from downtime
  useEffect(() => {
    const prev = prevHealthRef.current;
    prevHealthRef.current = agentHealth.status;

    if (agentHealth.status === 'healthy' && !hasBeenHealthyRef.current) {
      hasBeenHealthyRef.current = true;
    } else if (prev !== 'healthy' && agentHealth.status === 'healthy' && hasBeenHealthyRef.current) {
      const currentMsgCount = currentChat?.messages?.length ?? 0;
      if (currentMsgCount > 0) {
        let lastUpdateCount = currentMsgCount;
        const recoveryPoll = setInterval(async () => {
          try {
            const { messages: msgs, interrupt } = await getThreadStateAndInterrupt(threadId);

            if (interrupt) {
              dispatch(updateChat({ id: threadId, updates: { messages: msgs } }));
              thread.setMessages(msgs.map((m) => JSON.parse(JSON.stringify(m)) as Message));

              const queueKey = `pending-decision:${threadId}`;
              const raw = localStorage.getItem(queueKey);
              if (raw) {
                const { decisions } = JSON.parse(raw) as { decisions: Array<{ type: 'approve' | 'reject'; message?: string }> };
                localStorage.removeItem(queueKey);
                dispatch(updateStreamingState({
                  chatId: threadId,
                  state: { error: null, isLoading: false, isConnected: false, pendingInterrupt: null },
                }));
                clearInterval(recoveryPoll);
                thread.resumeWithDecisions(decisions).catch((err) => {
                  console.error('Queued decision replay failed:', err);
                });
              } else {
                dispatch(updateStreamingState({
                  chatId: threadId,
                  state: {
                    error: null, isLoading: false, isConnected: false,
                    pendingInterrupt: {
                      value: interrupt.value as any,
                      resumable: interrupt.resumable,
                    },
                  },
                }));
                clearInterval(recoveryPoll);
              }
              return;
            }

            if (msgs.length > lastUpdateCount) {
              lastUpdateCount = msgs.length;
              dispatch(updateChat({ id: threadId, updates: { messages: msgs } }));
              thread.setMessages(msgs.map((m) => JSON.parse(JSON.stringify(m)) as Message));
              dispatch(updateStreamingState({
                chatId: threadId,
                state: { error: null, isLoading: false, isConnected: false, pendingInterrupt: null },
              }));
              const last = msgs[msgs.length - 1];
              const isFinalResponse = last?.type === 'ai' && last.content &&
                (!Array.isArray((last as any).tool_calls) || (last as any).tool_calls.length === 0);
              if (isFinalResponse) {
                clearInterval(recoveryPoll);
              }
            }
          } catch {
            // agent may still be recovering
          }
        }, 5000);
        setTimeout(() => clearInterval(recoveryPoll), 120000);
      }
    }
  }, [agentHealth.status, threadId, thread, dispatch, currentChat]);

  const handleNewChat = useCallback(() => {
    navigate('/');
  }, [navigate]);

  const handleExportMarkdown = useCallback(() => {
    if (!currentChat || thread.messages.length === 0) return;
    const title = currentChat.title || 'Chat';
    const md = exportAsMarkdown(thread.messages, title);
    downloadFile(md, `${slugifyExportBase(title)}.md`, 'text/markdown;charset=utf-8');
  }, [currentChat, thread.messages]);

  const handleExportJson = useCallback(() => {
    if (!currentChat || thread.messages.length === 0) return;
    const title = currentChat.title || 'Chat';
    const json = exportAsJSON(thread.messages, title);
    downloadFile(json, `${slugifyExportBase(title)}.json`, 'application/json;charset=utf-8');
  }, [currentChat, thread.messages]);

  const handleExportShortcut = useCallback(() => {
    handleExportMarkdown();
  }, [handleExportMarkdown]);

  useKeyboardShortcuts({
    onFocusInput: () => chatInputRef.current?.focus(),
    onCancelStream: handleCancel,
    getIsStreaming: () => thread.isLoading,
    onBlurChatInput: () => chatInputRef.current?.blur(),
    onExportChat: handleExportShortcut,
  });

  if (chatsLoading || hydrating) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Spinner size="lg" aria-label="Loading chat" />
        <p className="text-muted-foreground">{hydrating ? 'Loading messages...' : 'Loading chat...'}</p>
      </div>
    );
  }

  if (threadId && !currentChat) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h1 className="text-2xl text-muted-foreground font-bold">Chat Not Found</h1>
        <p className="text-muted-foreground">The requested chat could not be found.</p>
        <Button variant="primary" onClick={() => navigate('/')}>Go Home</Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h1 className="text-2xl text-destructive font-bold">Error</h1>
        <p className="text-destructive">{error}</p>
        <Button variant="danger" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  const hasToolCalls = thread.messages.some(
    (m) => m.type === 'ai' && Array.isArray((m as any).tool_calls) && (m as any).tool_calls.length > 0,
  );

  return (
    <ChatErrorBoundary chatId={threadId} onRetry={handleRetry}>
      <ChatActionsProvider value={chatActions}>
        <div aria-live="polite" className="sr-only">
          {streamAnnouncement}
        </div>
        <h1 className="sr-only">{currentChat?.title || 'Chat'}</h1>
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 flex flex-col min-w-0">
            {hasToolCalls && (
              <TaskProgressStepper messages={thread.messages} isLoading={thread.isLoading} />
            )}
            <ReconnectingBanner streamingState={streamingState} maxRetries={MAX_RETRIES} />
            <ChatMessagesView
              key={threadId}
              messages={thread.messages}
              streamEvents={thread.streamEvents}
              isLoading={thread.isLoading || !!thread.pendingInterrupt}
              pendingInterrupt={
                thread.pendingInterrupt &&
                typeof thread.pendingInterrupt.value === 'object' &&
                'action_requests' in thread.pendingInterrupt.value
                  ? thread.pendingInterrupt
                  : null
              }
              onInterruptResume={handleInterruptResume}
              onAlwaysAllow={handleAlwaysAllow}

              interruptContent={
                thread.pendingInterrupt &&
                !(typeof thread.pendingInterrupt.value === 'object' && 'action_requests' in thread.pendingInterrupt.value)
                  ? (
                    <InterruptBanner
                      interrupt={thread.pendingInterrupt}
                      onResume={handleMCPOAuthResume}
                      onDismiss={handleInterruptDismiss}
                    />
                  )
                  : undefined
              }
              onRetry={handleStreamRetry}
              scrollAreaRef={scrollAreaRef}
              onSubmit={handleSubmit}
              onEditMessage={handleEditMessage}
              onCancel={handleCancel}
              onNewChat={handleNewChat}
              liveActivityEvents={processedEventsTimeline}
              historicalActivities={historicalActivities}
              isRateLimited={rateLimit.isRateLimited}
              rateLimitRemainingSeconds={rateLimit.retryAfterSeconds}
              mcpEvents={thread.mcpEvents}
              chatId={threadId}
              traceId={thread.traceId}
              userId={feedbackUserId}
              messageFeedback={currentChat?.feedback ?? {}}
              lastResponseTiming={
                thread.totalDuration != null
                  ? {
                      timeToFirstTokenMs: thread.timeToFirstToken,
                      totalDurationMs: thread.totalDuration,
                    }
                  : null
              }
              chatInputRef={chatInputRef}
              onExportMarkdown={handleExportMarkdown}
              onExportJson={handleExportJson}
            />
          </div>
          {debugMode && (
            <div className="w-64 shrink-0 self-stretch border-l border-border hidden lg:flex lg:flex-col p-2 gap-2">
              <div className="flex-1 min-h-0 overflow-y-auto">
                <TasksSidebar messages={thread.messages} isLoading={thread.isLoading} />
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto border-t border-border pt-2">
                <DebugPanel messages={thread.messages} streamingState={streamingState} />
              </div>
            </div>
          )}
        </div>
      </ChatActionsProvider>
    </ChatErrorBoundary>
  );
}

export function ChatRoutePage() {
  const { threadId = '' } = useParams<{ threadId: string }>();
  return <ChatPage threadId={threadId} key={threadId} />;
}
