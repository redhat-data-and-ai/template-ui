import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { Message } from '@langchain/langgraph-sdk';
import { Button, Spinner } from '@patternfly/react-core';

import { useAppSelector, useAppDispatch } from '../redux/hooks';
import {
  selectChatById,
  selectIsLoadingThreads,
  selectChatsError,
  selectStreamingState,
  updateChat,
  updateStreamingState,
} from '../redux/slices/chats';
import { selectDebugMode } from '../redux/slices/userSettings';
import { addToast } from '../redux/slices/toasts';
import { useStreamingAPI } from '../hooks/useStreamingAPI';
import { ChatMessagesView } from '../components/ChatMessagesView';
import { ChatErrorBoundary } from '../components/ChatErrorBoundary';
import { InterruptBanner } from '../components/InterruptBanner';
import { TaskProgressStepper } from '../components/TaskProgressStepper';
import { TasksSidebar } from '../components/TasksSidebar';
import { DebugPanel } from '../components/DebugPanel';
import { ProcessedEvent } from '../components/ActivityTimeline';
import { getThreadState } from '../services/agent-rest';

export function ChatPage({ threadId }: { threadId: string }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const currentChat = useAppSelector((state) => selectChatById(state, threadId));
  const chatsLoading = useAppSelector(selectIsLoadingThreads);
  const error = useAppSelector(selectChatsError);
  const debugMode = useAppSelector(selectDebugMode);
  const streamingState = useAppSelector((state) => selectStreamingState(state, threadId));

  const [processedEventsTimeline, setProcessedEventsTimeline] = useState<ProcessedEvent[]>([]);
  const [historicalActivities, setHistoricalActivities] = useState<Record<string, ProcessedEvent[]>>({});
  const [hydrating, setHydrating] = useState(false);

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const hasFinalizeEventOccurredRef = useRef(false);

  const thread = useStreamingAPI(threadId);

  const chatId = currentChat?.id;
  const hasMessages = currentChat && currentChat.messages.length > 0;

  useEffect(() => {
    if (!chatId || hasMessages || hydrating) return;

    const locState = location.state as Record<string, unknown> | null;
    if (locState?.initialPrompt != null) return;

    let cancelled = false;
    setHydrating(true);

    getThreadState(chatId).then((msgs) => {
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
      }
      setHydrating(false);
    }).catch(() => {
      if (!cancelled) setHydrating(false);
    });

    return () => { cancelled = true; setHydrating(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

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

  const handleSubmit = useCallback(
    async (inputValue: string) => {
      if (!threadId || !currentChat) return;

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        type: 'human',
        content: inputValue.trim(),
      };

      const messages = [...thread.messages, userMessage];

      try {
        await thread.submit({ messages });
        setTimeout(() => {
          hasFinalizeEventOccurredRef.current = true;
        }, 100);
      } catch (err) {
        console.error('Failed to submit message:', err);
        dispatch(addToast({ title: 'Failed to send message', message: 'Please try again.', variant: 'danger' }));
      }
    },
    [thread, threadId, currentChat, dispatch]
  );

  const handleCancel = useCallback(() => {
    thread.stop();
  }, [thread]);

  const handleRetry = useCallback(() => {
    setProcessedEventsTimeline([]);
    setHistoricalActivities(currentChat?.historicalActivities || {});
  }, [currentChat]);

  const handleStreamRetry = useCallback(async () => {
    if (!threadId || !currentChat || thread.messages.length === 0) return;
    try {
      await thread.submit({ messages: thread.messages });
      setTimeout(() => {
        hasFinalizeEventOccurredRef.current = true;
      }, 100);
    } catch (err) {
      console.error('Failed to retry:', err);
      dispatch(addToast({ title: 'Failed to retry', message: 'Please try again.', variant: 'danger' }));
    }
  }, [thread, threadId, currentChat, dispatch]);

  const handleInterruptResume = useCallback(
    async (response: string) => {
      if (!threadId || !currentChat) return;
      dispatch(
        updateStreamingState({
          chatId: threadId,
          state: { pendingInterrupt: null },
        }),
      );
      const resumeMessage: Message = {
        id: `msg-${Date.now()}`,
        type: 'human',
        content: response,
      };
      try {
        await thread.submit({ messages: [...thread.messages, resumeMessage] });
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

  const handleNewChat = useCallback(() => {
    navigate('/');
  }, [navigate]);

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
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          {hasToolCalls && (
            <TaskProgressStepper messages={thread.messages} isLoading={thread.isLoading} />
          )}
          {thread.pendingInterrupt && (
            <InterruptBanner
              interrupt={thread.pendingInterrupt}
              onResume={handleInterruptResume}
              onDismiss={handleInterruptDismiss}
            />
          )}
          <ChatMessagesView
            key={threadId}
            messages={thread.messages}
            streamEvents={thread.streamEvents}
            isLoading={thread.isLoading}
            onRetry={handleStreamRetry}
            scrollAreaRef={scrollAreaRef}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
            onNewChat={handleNewChat}
            liveActivityEvents={processedEventsTimeline}
            historicalActivities={historicalActivities}
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
    </ChatErrorBoundary>
  );
}

export function ChatRoutePage() {
  const { threadId = '' } = useParams<{ threadId: string }>();
  return <ChatPage threadId={threadId} key={threadId} />;
}
