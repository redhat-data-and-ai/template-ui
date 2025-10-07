import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import type { Message } from "@langchain/langgraph-sdk";

import { useChat } from '../contexts/ChatContext';
import { useDataStream } from '../hooks/useDataStream';
import { ChatMessagesView } from '../components/ChatMessagesView';
import { ChatErrorBoundary } from '../components/ChatErrorBoundary';
import { Button } from '../components/ui/button';
import { ProcessedEvent } from '../components/ActivityTimeline';

export function ChatPage({ threadId }: { threadId: string }) {
  const {
    isLoading: chatsLoading,
    error,
    updateChatMessages,
    updateChatActivities,
    setError,
    getChatById
  } = useChat();

  // Local state
  const [processedEventsTimeline, setProcessedEventsTimeline] = useState<ProcessedEvent[]>([]);
  const [historicalActivities, setHistoricalActivities] = useState<Record<string, ProcessedEvent[]>>({});

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const hasFinalizeEventOccurredRef = useRef(false);

  // Get current chat data directly by threadId
  const currentChat = useMemo(() => threadId ? getChatById(threadId) : undefined, [threadId, getChatById]);

  console.log({ currentChat })

  // API integration
  const thread = useDataStream({
    apiUrl: "http://localhost:5002",
    threadId: threadId || "",
    onError: (error: Error) => {
      setError(error.message);
    },
  });

  useEffect(() => {
    if (currentChat) {
      thread.setMessages(currentChat.messages)
    }
  }, [currentChat?.messages, currentChat?.messages?.length]);

  // // Load chat data when threadId changes
  // useEffect(() => {
  //   if (currentChat) {
  //     setHistoricalActivities(currentChat.historicalActivities);
  //     setProcessedEventsTimeline([]);
  //   }
  // }, [currentChat, threadId]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [thread.messages]);

  // Update chat messages when thread messages change
  const previousMessagesLength = useRef(0);
  useEffect(() => {
    if (threadId && thread.messages.length > 0 && thread.messages.length !== previousMessagesLength.current) {
      updateChatMessages(threadId, thread.messages);
      previousMessagesLength.current = thread.messages.length;
    }
  }, [threadId, thread.messages, updateChatMessages]);

  // Handle finalization of activities
  useEffect(() => {
    if (
      hasFinalizeEventOccurredRef.current &&
      !thread.isLoading &&
      thread.messages.length > 0 &&
      threadId
    ) {
      const lastMessage = thread.messages[thread.messages.length - 1];
      if (lastMessage && lastMessage.type === "ai" && lastMessage.id) {
        updateChatActivities(threadId, lastMessage.id, processedEventsTimeline);
      }
      hasFinalizeEventOccurredRef.current = false;
    }
  }, [thread.isLoading, threadId, updateChatActivities, thread.messages, processedEventsTimeline]); // Removed thread.messages and processedEventsTimeline to prevent loops

  // Handle submit
  const handleSubmit = useCallback(
    async (inputValue: string) => {
      if (!threadId || !currentChat) {
        console.error('No active chat to submit to');
        return;
      }

      // Create message from user input
      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        type: "human",
        content: inputValue.trim()
      };

      // Add user message to existing messages
      const messages = [...thread.messages, userMessage];

      // Submit to the thread
      try {
        await thread.submit({ messages });

        // Mark that we're waiting for finalization
        setTimeout(() => {
          hasFinalizeEventOccurredRef.current = true;
        }, 100);
      } catch (error) {
        console.error('Failed to submit message:', error);
        setError('Failed to send message. Please try again.');
      }
    },
    [thread, threadId, currentChat, setError]
  );

  // Handle cancel
  const handleCancel = useCallback(() => {
    thread.stop();
  }, [thread]);

  // Handle retry for error boundary
  const handleRetry = useCallback(() => {
    setProcessedEventsTimeline([]);
    setHistoricalActivities(currentChat?.historicalActivities || {});
    // Reset any error state
    if (currentChat) {
      setHistoricalActivities(currentChat.historicalActivities);
    }
  }, [currentChat]);

  // Show loading while chats are being loaded from localStorage
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

  // Handle case where chat doesn't exist (after chats have loaded)
  if (threadId && !currentChat) {
    return (
      <main className="flex-1 h-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center h-full">
          <div className="flex flex-col items-center justify-center gap-4">
            <h1 className="text-2xl text-neutral-400 font-bold">Chat Not Found</h1>
            <p className="text-neutral-500">The requested chat could not be found.</p>
            <Button onClick={() => window.location.href = '/'}>
              Go Home
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // Handle error state
  if (error) {
    return (
      <main className="flex-1 h-full max-w-4xl mx-auto">
        <div className="flex flex-col items-center justify-center h-full">
          <div className="flex flex-col items-center justify-center gap-4">
            <h1 className="text-2xl text-red-400 font-bold">Error</h1>
            <p className="text-red-400">{error}</p>
            <Button
              variant="destructive"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </div>
        </div>
      </main>
    );
  }

  // Render chat interface
  return (
    <main className="flex-1 h-full max-w-4xl mx-auto">
      <ChatErrorBoundary
        chatId={threadId}
        onRetry={handleRetry}
      >
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
  const { threadId = "" } = useParams<{ threadId: string }>();

  return (
    <ChatPage threadId={threadId} key={threadId} />
  );
}
