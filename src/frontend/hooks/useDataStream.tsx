import { useCallback, useState, useEffect, useRef } from "react";
import type { AIMessage, Message } from "@langchain/langgraph-sdk";
import { useRefreshableToken } from "./useRefreshableToken";
import { chatStorage } from "@/services/chatStorage";
import type { DeepResearchEvent } from "../types/chat";
import { getAdapterAsync, getAdapter, isAdapterReady } from "../adapters/deep-research";
import type { NormalizedChunk, AdapterFeatures } from "../adapters/deep-research";
import { getBackendUrl, getUserId } from "../config";

export interface PendingPlan {
  subqueries: string[];
  enrichedSubqueries?: Record<string, unknown>[];
  understanding?: string;
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
  streamId?: string;
}

interface StreamRequestOptions {
  body?: Record<string, unknown>;
  initialMessages: Message[];
  initialDREvents: DeepResearchEvent[];
  resetDREvents: boolean;
  triggerMessageId?: string;
  readerProvider?: (signal: AbortSignal) => Promise<{ reader: ReadableStreamDefaultReader<Uint8Array>; streamId?: string }>;
}

/**
 * Global registry keyed by threadId. Intentionally module-scoped so that a
 * stream survives component unmount/remount (e.g. navigation). Only one entry
 * per threadId is allowed; starting a new stream for the same thread aborts
 * the previous one.
 */
const activeStreams = new Map<string, StreamEntry>();

export function useDataStream({
  threadId,
  onError,
  deepResearchEnabled = false,
}: {
  threadId: string;
  onError: (error: Error) => void;
  deepResearchEnabled?: boolean;
}) {
  const defaultFeatures: AdapterFeatures = {
    planApproval: false, steering: false, modelSelection: false,
  };
  const [adapterFeatures, setAdapterFeatures] = useState<AdapterFeatures>(() =>
    isAdapterReady() ? getAdapter().features : defaultFeatures,
  );

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!deepResearchEnabled) return;
    let cancelled = false;
    getAdapterAsync()
      .then((a) => {
        if (cancelled) return;
        setAdapterFeatures(prev => {
          const next = a.features;
          if (
            prev.planApproval === next.planApproval &&
            prev.steering === next.steering &&
            prev.modelSelection === next.modelSelection
          ) return prev;
          return { ...next };
        });
      })
      .catch((error: unknown) => {
        const discoveryError = error instanceof Error ? error : new Error(String(error));
        console.error("Adapter discovery failed:", discoveryError.message);
        if (!cancelled) onErrorRef.current(discoveryError);
      });
    return () => { cancelled = true; };
  }, [deepResearchEnabled]);

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

  const notifyRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const entry = activeStreams.get(threadId);
    if (!entry) return;

    setMessages(entry.messages);
    setDeepResearchEvents(entry.deepResearchEvents);
    setIsLoading(entry.isLoading);

    notifyRef.current = () => {
      setMessages(entry.messages);
      setDeepResearchEvents(entry.deepResearchEvents);
      setIsLoading(entry.isLoading);
    };

    entry.notify = () => notifyRef.current?.();

    return () => {
      notifyRef.current = null;
    };
  }, [threadId]);

  useEffect(() => {
    return () => {
      const entry = activeStreams.get(threadId);
      if (entry) {
        entry.controller.abort();
        activeStreams.delete(threadId);
      }
    };
  }, [threadId]);

  useEffect(() => {
    chatStorage.saveChatByThreadId(
      threadId, messages,
      deepResearchEvents.length > 0 ? deepResearchEvents : undefined
    );
  }, [messages, threadId, deepResearchEvents]);

  const setPendingPlanRef = useRef(setPendingPlan);
  setPendingPlanRef.current = setPendingPlan;

  const processChunk = useCallback((chunk: NormalizedChunk, entry: StreamEntry) => {
    if (chunk.chunk_id !== undefined) {
      if (entry.processedChunkIds.has(chunk.chunk_id)) return;
      entry.processedChunkIds.add(chunk.chunk_id);
    }

    switch (chunk.type) {
      case "deep_research_status": {
        const drEvent = chunk.content;
        if (!drEvent.timestamp) drEvent.timestamp = new Date().toISOString();
        if (entry.triggerMessageId) drEvent.triggerMessageId = entry.triggerMessageId;
        entry.deepResearchEvents = [...entry.deepResearchEvents, drEvent];

        if (drEvent.event_type === "plan_pending" && drEvent.details?.requires_approval) {
          const subqueries: string[] =
            (drEvent.details.subqueries as string[] | undefined) ??
            (drEvent.details.enriched_subqueries as Record<string, unknown>[] | undefined)?.map(
              (eq: Record<string, unknown>) => eq.query as string
            ) ?? [];
          if (subqueries.length > 0) {
            setPendingPlanRef.current({
              subqueries,
              enrichedSubqueries: drEvent.details.enriched_subqueries as Record<string, unknown>[] | undefined,
              understanding: drEvent.details.query_understanding as string | undefined,
            });
          }
        }

        if (drEvent.event_type === "final_answer") {
          entry.isStreamingTokens = false;
          const report = drEvent.details?.report as string | undefined;
          if (report) {
            const aiMsg: AIMessage = {
              type: "ai",
              content: report,
              tool_calls: [],
              id: `dr-report-${Date.now()}`,
            };
            entry.messages = [...entry.messages, aiMsg];
          }
        }
        break;
      }

      case "error": {
        const errorMsg = chunk.content.message ?? "An error occurred";
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
        break;
      }

      case "token": {
        const tokenStr = chunk.content;
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
        break;
      }

      case "message": {
        entry.isStreamingTokens = false;
        const msg = chunk.content as unknown as Message;
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
        break;
      }
    }

    entry.notify?.();
  }, []);

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
      notify: () => notifyRef.current?.(),
    };
    activeStreams.set(threadId, entry);

    notifyRef.current = () => {
      setMessages(entry.messages);
      setDeepResearchEvents(entry.deepResearchEvents);
      setIsLoading(entry.isLoading);
    };

    setIsLoading(true);
    setMessages([...options.initialMessages]);
    if (options.resetDREvents) {
      setDeepResearchEvents([]);
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    try {
      if (options.readerProvider) {
        const handle = await options.readerProvider(abortController.signal);
        reader = handle.reader;
        entry.streamId = handle.streamId;
      } else if (options.body) {
        const apiUrl = getBackendUrl();
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

        const body = response.body?.getReader();
        if (!body) {
          throw new Error("Failed to get reader from response body");
        }
        reader = body;
      } else {
        throw new Error("No body or readerProvider specified");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let chunksSinceSave = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true }).replaceAll('\r\n', '\n');
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const result = getAdapter().normalizeChunk(line);
          if (!result) continue;

          const normalized = Array.isArray(result) ? result : [result];
          for (const chunk of normalized) {
            processChunk(chunk, entry);
          }

          chunksSinceSave += normalized.length;
          if (chunksSinceSave >= 20) {
            chatStorage.saveChatByThreadId(threadId, entry.messages, entry.deepResearchEvents);
            chunksSinceSave = 0;
          }
        }
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error("Streaming error:", error);
        onErrorRef.current(error);
      }
    } finally {
      entry.isLoading = false;
      reader?.cancel().catch(() => {});
      chatStorage.saveChatByThreadId(threadId, entry.messages, entry.deepResearchEvents);
      setMessages(entry.messages);
      setDeepResearchEvents(entry.deepResearchEvents);
      setIsLoading(false);
      activeStreams.delete(threadId);
    }
  }, [refreshableToken, threadId, processChunk]);

  const submit = useCallback(async ({ messages }: { messages: Message[] }) => {
    const humanMsg = messages.at(-1);

    if (deepResearchEnabled) {
      const adapter = await getAdapterAsync();
      const existing = activeStreams.get(threadId);
      const previousDREvents = existing?.deepResearchEvents ?? deepResearchEvents;

      await performStreamRequest({
        initialMessages: messages,
        initialDREvents: previousDREvents,
        resetDREvents: false,
        triggerMessageId: humanMsg?.id,
        readerProvider: (signal) => adapter.startResearch({
          message: (humanMsg?.content as string) ?? "",
          threadId: threadId || "default-thread",
          sessionId: threadId || "default-session",
          userId: getUserId(),
          token: refreshableToken ?? undefined,
          signal,
        }),
      });
    } else {
      const body: Record<string, unknown> = {
        message: humanMsg?.content ?? "",
        thread_id: threadId || "default-thread",
        session_id: threadId || "default-session",
        user_id: getUserId(),
        stream_tokens: true,
      };

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
    }
  }, [threadId, deepResearchEnabled, deepResearchEvents, performStreamRequest, refreshableToken]);

  const approvePlan = useCallback(async (plan: string[]) => {
    if (!pendingPlan) return;
    const adapter = await getAdapterAsync();
    if (!adapter.approvePlan) return;
    setPendingPlan(null);

    const userMessage = [...messages].reverse().find(m => m.type === "human");

    await performStreamRequest({
      initialMessages: messages,
      initialDREvents: deepResearchEvents,
      resetDREvents: false,
      triggerMessageId: userMessage?.id,
      readerProvider: (signal) => adapter.approvePlan!({
        message: (userMessage?.content as string) ?? "",
        threadId,
        sessionId: threadId,
        userId: getUserId(),
        token: refreshableToken ?? undefined,
        signal,
        plan,
      }),
    });
  }, [threadId, messages, deepResearchEvents, pendingPlan, performStreamRequest, refreshableToken]);

  const stop = useCallback(() => {
    const existing = activeStreams.get(threadId);
    const backendStreamId = existing?.streamId ?? threadId;
    if (existing) {
      existing.controller.abort();
      activeStreams.delete(threadId);
    }
    if (deepResearchEnabled && backendStreamId && isAdapterReady()) {
      getAdapter().cancelResearch(backendStreamId, refreshableToken ?? undefined);
    }
    setIsLoading(false);
  }, [threadId, deepResearchEnabled, refreshableToken]);

  const sendSteering = useCallback(async (message: string) => {
    const adapter = await getAdapterAsync();
    if (!adapter.sendSteeringMessage) return;
    const entry = activeStreams.get(threadId);
    const sessionId = entry?.streamId ?? threadId;
    return adapter.sendSteeringMessage(sessionId, message);
  }, [threadId]);

  return {
    messages,
    deepResearchEvents,
    isLoading,
    submit,
    stop,
    setMessages,
    pendingPlan,
    approvePlan,
    sendSteering,
    adapterFeatures,
  };
}
