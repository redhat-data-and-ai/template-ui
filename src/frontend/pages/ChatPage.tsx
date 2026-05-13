import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { Message } from '@langchain/langgraph-sdk';
import { Spinner } from '@patternfly/react-core';

import { useAppSelector, useAppDispatch } from '../redux/hooks';
import {
  selectChatById,
  selectIsLoadingThreads,
  selectChatsError,
  updateChat,
  setError,
} from '../redux/slices/chats';
import { useStreamingAPI } from '../hooks/useStreamingAPI';
import { ChatMessagesView } from '../components/ChatMessagesView';
import { ChatErrorBoundary } from '../components/ChatErrorBoundary';
import { Button } from '../components/ui/button';
import { ProcessedEvent } from '../components/ActivityTimeline';
import { getThreadState } from '../services/agent-rest';

export function ChatPage({ threadId }: { threadId: string }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const currentChat = useAppSelector((state) => selectChatById(state, threadId));
  const chatsLoading = useAppSelector(selectIsLoadingThreads);
  const error = useAppSelector(selectChatsError);

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

    return () => { cancelled = true; };
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
        dispatch(setError('Failed to send message. Please try again.'));
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
      dispatch(setError('Failed to retry. Please try again.'));
    }
  }, [thread, threadId, currentChat, dispatch]);

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
        <Button onClick={() => navigate('/')}>Go Home</Button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <h1 className="text-2xl text-destructive font-bold">Error</h1>
        <p className="text-destructive">{error}</p>
        <Button variant="destructive" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <ChatErrorBoundary chatId={threadId} onRetry={handleRetry}>
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
    </ChatErrorBoundary>
  );
}

export function ChatRoutePage() {
  const { threadId = '' } = useParams<{ threadId: string }>();
  return <ChatPage threadId={threadId} key={threadId} />;
}
