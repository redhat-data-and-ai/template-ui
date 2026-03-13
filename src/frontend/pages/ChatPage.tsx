import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import type { Message } from "@langchain/langgraph-sdk";

import { useChat } from '../contexts/ChatContext';
import { useDataStream } from '../hooks/useDataStream';
import { ChatMessagesView } from '../components/ChatMessagesView';
import { ChatErrorBoundary } from '../components/ChatErrorBoundary';
import { Button } from '../components/ui/button';

export function ChatPage({ threadId }: Readonly<{ threadId: string }>) {
  const {
    isLoading: chatsLoading,
    error,
    updateChatMessages,
    updateChatActivities,
    updateChatDeepResearchEvents,
    setError,
    getChatById
  } = useChat();

  const currentChat = useMemo(() => threadId ? getChatById(threadId) : undefined, [threadId, getChatById]);

  const hadDeepResearch = (currentChat?.deepResearchEvents?.length ?? 0) > 0;
  const [deepResearchEnabled, setDeepResearchEnabled] = useState(hadDeepResearch);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const hasFinalizeEventOccurredRef = useRef(false);

  const thread = useDataStream({
    apiUrl: (globalThis as Record<string, unknown> as { APP_DATA?: { apiUrl?: string } }).APP_DATA?.apiUrl || "http://localhost:5002",
    threadId: threadId || "",
    onError: (err: Error) => setError(err.message),
    deepResearchEnabled,
  });

  useEffect(() => {
    if (currentChat && currentChat.messages.length > 0 && thread.messages.length === 0) {
      thread.setMessages(currentChat.messages);
    }
  }, [currentChat?.messages, currentChat?.messages?.length]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [thread.messages]);

  const previousMessagesLength = useRef(0);
  useEffect(() => {
    if (threadId && thread.messages.length > 0 && thread.messages.length !== previousMessagesLength.current) {
      updateChatMessages(threadId, thread.messages);
      previousMessagesLength.current = thread.messages.length;
    }
  }, [threadId, thread.messages, updateChatMessages]);

  useEffect(() => {
    if (threadId && thread.deepResearchEvents.length > 0) {
      updateChatDeepResearchEvents(threadId, thread.deepResearchEvents);
      if (!deepResearchEnabled) {
        setDeepResearchEnabled(true);
      }
    }
  }, [threadId, thread.deepResearchEvents, updateChatDeepResearchEvents]);

  useEffect(() => {
    if (
      hasFinalizeEventOccurredRef.current &&
      !thread.isLoading &&
      thread.messages.length > 0 &&
      threadId
    ) {
      const lastMessage = thread.messages.at(-1);
      if (lastMessage?.type === "ai" && lastMessage.id) {
        updateChatActivities(threadId, lastMessage.id, []);
      }
      hasFinalizeEventOccurredRef.current = false;
    }
  }, [thread.isLoading, threadId, updateChatActivities, thread.messages]);

  const handleSubmit = useCallback(
    async (inputValue: string) => {
      if (!threadId || !currentChat) {
        console.error('No active chat to submit to');
        return;
      }

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        type: "human",
        content: inputValue.trim(),
      };

      const messages = [...thread.messages, userMessage];

      try {
        await thread.submit({ messages });
        setTimeout(() => { hasFinalizeEventOccurredRef.current = true; }, 100);
      } catch {
        setError('Failed to send message. Please try again.');
      }
    },
    [thread, threadId, currentChat, setError]
  );

  const handleCancel = useCallback(() => {
    thread.stop();
  }, [thread]);

  const handleRetry = useCallback(() => {
    // no-op: error boundary reset
  }, []);

  if (chatsLoading) {
    return (
      <main className="flex-1 h-full w-full">
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
      <main className="flex-1 h-full w-full">
        <div className="flex flex-col items-center justify-center h-full">
          <div className="flex flex-col items-center justify-center gap-4">
            <h1 className="text-2xl text-neutral-400 font-bold">Chat Not Found</h1>
            <p className="text-neutral-500">The requested chat could not be found.</p>
            <Button onClick={() => window.location.href = '/'}>Go Home</Button>
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex-1 h-full w-full">
        <div className="flex flex-col items-center justify-center h-full">
          <div className="flex flex-col items-center justify-center gap-4">
            <h1 className="text-2xl text-red-400 font-bold">Error</h1>
            <p className="text-red-400">{error}</p>
            <Button variant="destructive" onClick={() => window.location.reload()}>Retry</Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 h-full w-full">
      <ChatErrorBoundary chatId={threadId} onRetry={handleRetry}>
        <ChatMessagesView
          key={threadId}
          messages={thread.messages}
          isLoading={thread.isLoading}
          scrollAreaRef={scrollAreaRef}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          liveActivityEvents={[]}
          deepResearchEnabled={deepResearchEnabled}
          deepResearchLocked={hadDeepResearch || (deepResearchEnabled && thread.messages.length > 0)}
          onToggleDeepResearch={() => setDeepResearchEnabled(prev => !prev)}
          deepResearchEvents={thread.deepResearchEvents}
          pendingPlan={thread.pendingPlan}
          onApprovePlan={(subqueries) => thread.approvePlan(subqueries)}
          onRejectPlan={() => thread.stop()}
        />
      </ChatErrorBoundary>
    </main>
  );
}

export function ChatRoutePage() {
  const { threadId = "" } = useParams<{ threadId: string }>();
  return <ChatPage threadId={threadId} key={threadId} />;
}
