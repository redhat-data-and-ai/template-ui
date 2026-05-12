import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import type { Message } from '@langchain/langgraph-sdk';

import { useAppSelector, useAppDispatch } from '../redux/hooks';
import {
  selectChatById,
  selectIsLoadingThreads,
  selectChatsError,
  updateChat,
  setError,
} from '../redux/slices/chats';
import { useDataStream } from '../hooks/useDataStream';
import { ChatMessagesView } from '../components/ChatMessagesView';
import { ChatErrorBoundary } from '../components/ChatErrorBoundary';
import { Button } from '../components/ui/button';
import { ProcessedEvent } from '../components/ActivityTimeline';

export function ChatPage({ threadId }: { threadId: string }) {
  const dispatch = useAppDispatch();
  const currentChat = useAppSelector((state) => selectChatById(state, threadId));
  const chatsLoading = useAppSelector(selectIsLoadingThreads);
  const error = useAppSelector(selectChatsError);

  const [processedEventsTimeline, setProcessedEventsTimeline] = useState<ProcessedEvent[]>([]);
  const [historicalActivities, setHistoricalActivities] = useState<Record<string, ProcessedEvent[]>>({});

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const hasFinalizeEventOccurredRef = useRef(false);

  const thread = useDataStream({
    apiUrl: window.APP_DATA?.apiUrl || '',
    threadId: threadId || '',
    onError: (err: Error) => {
      dispatch(setError(err.message));
    },
  });

  useEffect(() => {
    if (currentChat && !thread.isLoading) {
      thread.setMessages(currentChat.messages.map(m => JSON.parse(JSON.stringify(m))));
    }
  }, [currentChat?.id]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector(
        '[data-radix-scroll-area-viewport]'
      );
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [thread.messages]);

  const previousMessagesLength = useRef(0);
  useEffect(() => {
    if (threadId && thread.messages.length > 0 && thread.messages.length !== previousMessagesLength.current) {
      const updates: Record<string, unknown> = {
        messages: thread.messages.map(m => JSON.parse(JSON.stringify(m))),
        timestamp: new Date().toISOString(),
      };

      if (currentChat?.title === 'New Chat' && thread.messages.length > 0) {
        const content = thread.messages[0].content as string;
        updates.title = content.length > 40 ? content.substring(0, 40) + '...' : content || 'New Chat';
        updates.preview = (content).substring(0, 60) + '...';
      }

      dispatch(updateChat({ id: threadId, updates }));
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

  if (chatsLoading) {
    return (
      <main className="flex-1 h-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center h-full">
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-neutral-400"></div>
            <p className="text-neutral-500">Loading chat...</p>
          </div>
        </div>
      </main>
    );
  }

  if (threadId && !currentChat) {
    return (
      <main className="flex-1 h-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center h-full">
          <div className="flex flex-col items-center justify-center gap-4">
            <h1 className="text-2xl text-neutral-400 font-bold">Chat Not Found</h1>
            <p className="text-neutral-500">The requested chat could not be found.</p>
            <Button onClick={() => (window.location.href = '/')}>Go Home</Button>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 h-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center h-full">
          <div className="flex flex-col items-center justify-center gap-4">
            <h1 className="text-2xl text-red-400 font-bold">Error</h1>
            <p className="text-red-400">{error}</p>
            <Button variant="destructive" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </div>
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
