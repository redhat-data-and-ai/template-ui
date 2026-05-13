import { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

export function ChatPage({ threadId }: { threadId: string }) {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const currentChat = useAppSelector((state) => selectChatById(state, threadId));
  const chatsLoading = useAppSelector(selectIsLoadingThreads);
  const error = useAppSelector(selectChatsError);

  const [processedEventsTimeline, setProcessedEventsTimeline] = useState<ProcessedEvent[]>([]);
  const [historicalActivities, setHistoricalActivities] = useState<Record<string, ProcessedEvent[]>>({});

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const hasFinalizeEventOccurredRef = useRef(false);

  const thread = useStreamingAPI(threadId);

  const chatId = currentChat?.id;
  useEffect(() => {
    if (currentChat && !thread.isLoading) {
      thread.setMessages(currentChat.messages.map(m => JSON.parse(JSON.stringify(m))));
    }
    // Only re-sync when the active chat changes, not on every message update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

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

  const handleNewChat = useCallback(() => {
    navigate('/');
  }, [navigate]);

  if (chatsLoading) {
    return (
      <main className="flex-1 h-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <Spinner size="lg" aria-label="Loading chat" />
          <p className="text-muted-foreground">Loading chat...</p>
        </div>
      </main>
    );
  }

  if (threadId && !currentChat) {
    return (
      <main className="flex-1 h-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <h1 className="text-2xl text-muted-foreground font-bold">Chat Not Found</h1>
          <p className="text-muted-foreground">The requested chat could not be found.</p>
          <Button onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 h-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center h-full gap-4">
          <h1 className="text-2xl text-destructive font-bold">Error</h1>
          <p className="text-destructive">{error}</p>
          <Button variant="destructive" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 h-full max-w-4xl mx-auto">
      <ChatErrorBoundary chatId={threadId} onRetry={handleRetry}>
        <ChatMessagesView
          key={threadId}
          messages={thread.messages}
          streamEvents={thread.streamEvents}
          isLoading={thread.isLoading}
          scrollAreaRef={scrollAreaRef}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          onNewChat={handleNewChat}
          liveActivityEvents={processedEventsTimeline}
          historicalActivities={historicalActivities}
        />
      </ChatErrorBoundary>
    </main>
  );
}

export function ChatRoutePage() {
  const { threadId = '' } = useParams<{ threadId: string }>();
  return <ChatPage threadId={threadId} key={threadId} />;
}
