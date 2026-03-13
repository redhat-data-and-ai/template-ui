import { useCallback, useState, useEffect } from "react";
import type { AIMessage, Message } from "@langchain/langgraph-sdk";
import { useRefreshableToken } from "./useRefreshableToken";
import { chatStorage } from "@/services/chatStorage";
import type { DeepResearchEvent } from "../types/chat";

export interface PendingPlan {
  subqueries: string[];
  enrichedSubqueries?: Record<string, unknown>[];
  understanding?: string;
}

interface AgentStreamChunk {
  type: 'token' | 'message' | 'deep_research_status' | 'error';
  content: string | Message | DeepResearchEvent | Record<string, unknown>;
  chunk_id: number;
}

interface StreamEntry {
  controller: AbortController;
  messages: Message[];
  deepResearchEvents: DeepResearchEvent[];
  isLoading: boolean;
  processedChunkIds: Set<number>;
  isStreamingTokens: boolean;
  notify: (() => void) | null;
  triggerMessageId?: string;
}

interface StreamRequestOptions {
  body: Record<string, unknown>;
  initialMessages: Message[];
  initialDREvents: DeepResearchEvent[];
  resetDREvents: boolean;
  triggerMessageId?: string;
}

const activeStreams = new Map<string, StreamEntry>();

function getUserId(): string {
  return (globalThis as Record<string, unknown> as { USER_DATA?: { preferred_username?: string } })
    .USER_DATA?.preferred_username ?? "anonymous";
}

export function useDataStream({
  apiUrl,
  threadId,
  onError,
  deepResearchEnabled = false,
}: {
  apiUrl: string;
  threadId: string;
  onError: (error: Error) => void;
  deepResearchEnabled?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>(() => {
    const entry = activeStreams.get(threadId);
    if (entry) return entry.messages;
    try {
      const chat = chatStorage.loadChats().find(c => c.id === threadId);
      return chat?.messages || [];
    } catch {
      return [];
    }
  });

  const [deepResearchEvents, setDeepResearchEvents] = useState<DeepResearchEvent[]>(() => {
    const entry = activeStreams.get(threadId);
    if (entry) return entry.deepResearchEvents;
    try {
      const chat = chatStorage.loadChats().find(c => c.id === threadId);
      return chat?.deepResearchEvents || [];
    } catch {
      return [];
    }
  });

  const [pendingPlan, setPendingPlan] = useState<PendingPlan | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(() => {
    const entry = activeStreams.get(threadId);
    return entry?.isLoading ?? false;
  });

  const { token: refreshableToken } = useRefreshableToken();

  useEffect(() => {
    const entry = activeStreams.get(threadId);
    if (!entry) return;

    setMessages(entry.messages);
    setDeepResearchEvents(entry.deepResearchEvents);
    setIsLoading(entry.isLoading);

    entry.notify = () => {
      setMessages(entry.messages);
      setDeepResearchEvents(entry.deepResearchEvents);
      setIsLoading(entry.isLoading);
    };

    return () => {
      if (activeStreams.get(threadId) === entry) {
        entry.notify = null;
      }
    };
  }, [threadId]);

  useEffect(() => {
    chatStorage.saveChatByThreadId(
      threadId, messages,
      deepResearchEvents.length > 0 ? deepResearchEvents : undefined
    );
  }, [messages, threadId, deepResearchEvents]);

  const performStreamRequest = useCallback(async (options: StreamRequestOptions) => {
    const existing = activeStreams.get(threadId);
    if (existing) {
      existing.controller.abort();
      activeStreams.delete(threadId);
    }

    const abortController = new AbortController();
    const entry: StreamEntry = {
      controller: abortController,
      messages: [...options.initialMessages],
      deepResearchEvents: [...options.initialDREvents],
      isLoading: true,
      processedChunkIds: new Set(),
      isStreamingTokens: false,
      triggerMessageId: options.triggerMessageId,
      notify: () => {
        setMessages(entry.messages);
        setDeepResearchEvents(entry.deepResearchEvents);
        setIsLoading(entry.isLoading);
      },
    };
    activeStreams.set(threadId, entry);

    setIsLoading(true);
    setMessages([...options.initialMessages]);
    if (options.resetDREvents) {
      setDeepResearchEvents([]);
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (refreshableToken) headers["X-Token"] = refreshableToken;

      const response = await fetch(`${apiUrl}/v1/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify(options.body),
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Failed to get reader from response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let chunksSinceSave = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          let jsonData = trimmedLine;
          if (trimmedLine.startsWith('data: ')) {
            jsonData = trimmedLine.slice(6);
          }

          if (jsonData === '[DONE]' || jsonData === 'DONE') break;

          try {
            const parsedResult = JSON.parse(jsonData) as AgentStreamChunk;
            const { type, content, chunk_id } = parsedResult;

            if (entry.processedChunkIds.has(chunk_id)) continue;
            if (chunk_id) entry.processedChunkIds.add(chunk_id);

            if (type === "deep_research_status") {
              const drEvent = content as DeepResearchEvent;
              drEvent.timestamp = new Date().toISOString();
              if (entry.triggerMessageId) {
                drEvent.triggerMessageId = entry.triggerMessageId;
              }
              entry.deepResearchEvents = [...entry.deepResearchEvents, drEvent];

              if (drEvent.event_type === "plan_pending" && drEvent.details?.requires_approval) {
                const subqueries: string[] =
                  drEvent.details.subqueries ??
                  (drEvent.details.enriched_subqueries as Record<string, unknown>[])?.map(
                    (eq: Record<string, unknown>) => eq.query as string
                  ) ?? [];
                if (subqueries.length > 0) {
                  setPendingPlan({
                    subqueries,
                    enrichedSubqueries: drEvent.details.enriched_subqueries as Record<string, unknown>[] | undefined,
                    understanding: drEvent.details.query_understanding as string | undefined,
                  });
                }
              }

              if (drEvent.event_type === "final_answer") {
                entry.isStreamingTokens = false;
              }

              entry.notify?.();
              continue;
            }

            if (type === "error") {
              const errorMsg = (content as Record<string, unknown>)?.message as string ?? "An error occurred";
              const drEvent: DeepResearchEvent = {
                stage: "error",
                event_type: "error",
                message: errorMsg,
                display_text: errorMsg,
                log_entry: "",
                ui_visible: true,
                details: {},
                timestamp: new Date().toISOString(),
              };
              entry.deepResearchEvents = [...entry.deepResearchEvents, drEvent];
              entry.messages = [...entry.messages, {
                type: "ai",
                content: errorMsg,
                tool_calls: [],
                id: `error-${Date.now()}`,
              } as AIMessage];
              entry.notify?.();
              continue;
            }

            const isStreamingTokens = type === "token" && typeof content === 'string';
            const isAIMessage = type === 'message' && typeof content === 'object' && (content as Message).type !== "human";

            if (isAIMessage) {
              entry.isStreamingTokens = false;
              const msg = content as Message;
              const hasToolCalls = msg.type === 'ai' && Array.isArray(msg?.tool_calls) && msg.tool_calls.length > 0;
              const isToolResult = msg.type === 'tool';

              if (hasToolCalls) {
                entry.messages = [...entry.messages, msg];
              } else if (isToolResult) {
                const newMessages = [...entry.messages];
                const toolCallId = (msg as Record<string, unknown>).tool_call_id as string | undefined;
                if (toolCallId) {
                  for (const message of newMessages) {
                    if (message.type === 'ai' && Array.isArray(message.tool_calls)) {
                      const tc = message.tool_calls.find(t => t.id === toolCallId);
                      if (tc) (tc as Record<string, unknown>).content = msg.content;
                    }
                  }
                }
                entry.messages = newMessages;
              } else if (msg.type === 'ai' && typeof msg.content === 'string' && msg.content.trim()) {
                entry.messages = [...entry.messages, { ...msg, id: msg.id || `ai-msg-${Date.now()}` }];
              }
            } else if (isStreamingTokens) {
              const tokenStr = String(content);
              if (entry.isStreamingTokens) {
                const newMessages = [...entry.messages];
                const lastMsg = newMessages.at(-1);
                if (lastMsg) {
                  newMessages[newMessages.length - 1] = {
                    ...lastMsg,
                    content: (lastMsg.content as string) + tokenStr,
                  };
                }
                entry.messages = newMessages;
              } else {
                const message: AIMessage = {
                  type: "ai",
                  content: tokenStr,
                  tool_calls: [],
                  id: `${Date.now()}-${Math.random()}`,
                };
                entry.messages = [...entry.messages, message];
                entry.isStreamingTokens = true;
              }
            }

            entry.notify?.();

            chunksSinceSave++;
            if (chunksSinceSave >= 20) {
              chatStorage.saveChatByThreadId(threadId, entry.messages, entry.deepResearchEvents);
              chunksSinceSave = 0;
            }
          } catch (parseError) {
            console.warn("Failed to parse JSON chunk:", jsonData, parseError);
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error("Streaming error:", error);
        onError(error);
      }
    } finally {
      entry.isLoading = false;
      chatStorage.saveChatByThreadId(threadId, entry.messages, entry.deepResearchEvents);
      entry.notify?.();
      activeStreams.delete(threadId);
    }
  }, [apiUrl, onError, refreshableToken, threadId]);

  const submit = useCallback(async ({ messages }: { messages: Message[] }) => {
    const humanMsg = messages.at(-1);
    const body: Record<string, unknown> = {
      message: humanMsg?.content ?? "",
      thread_id: threadId || "default-thread",
      session_id: threadId || "default-session",
      user_id: getUserId(),
      stream_tokens: true,
    };

    if (deepResearchEnabled) {
      body.deep_research_enabled = true;
    }

    chatStorage.saveChatByThreadId(threadId, messages);

    const existing = activeStreams.get(threadId);
    const previousDREvents = existing?.deepResearchEvents ?? deepResearchEvents;

    await performStreamRequest({
      body,
      initialMessages: messages,
      initialDREvents: previousDREvents,
      resetDREvents: false,
      triggerMessageId: humanMsg?.id,
    });
  }, [threadId, deepResearchEnabled, deepResearchEvents, performStreamRequest]);

  const approvePlan = useCallback(async (plan: string[]) => {
    if (!pendingPlan) return;
    setPendingPlan(null);

    const userMessage = [...messages].reverse().find(m => m.type === "human");
    const body: Record<string, unknown> = {
      message: userMessage?.content ?? "",
      thread_id: threadId,
      session_id: threadId,
      user_id: getUserId(),
      stream_tokens: true,
      deep_research_enabled: true,
      deep_research_plan: plan,
      deep_research_plan_approved: true,
    };

    await performStreamRequest({
      body,
      initialMessages: messages,
      initialDREvents: deepResearchEvents,
      resetDREvents: false,
      triggerMessageId: userMessage?.id,
    });
  }, [threadId, messages, deepResearchEvents, pendingPlan, performStreamRequest]);

  const stop = useCallback(() => {
    const existing = activeStreams.get(threadId);
    if (existing) {
      existing.controller.abort();
      activeStreams.delete(threadId);
    }
    if (deepResearchEnabled && threadId) {
      fetch(`${apiUrl}/v1/cancel/${threadId}`, {
        method: "DELETE",
        headers: refreshableToken ? { "X-Token": refreshableToken } : {},
      }).catch(err => console.warn("Cancel request failed:", err));
    }
    setIsLoading(false);
  }, [apiUrl, threadId, deepResearchEnabled, refreshableToken]);

  return { messages, deepResearchEvents, isLoading, submit, stop, setMessages, pendingPlan, approvePlan };
}
