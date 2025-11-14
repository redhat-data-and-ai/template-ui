import { useCallback, useState, useRef, useEffect } from "react";
import type { AIMessage, Message } from "@langchain/langgraph-sdk";
import { useRefreshableToken } from "./useRefreshableToken";
import { chatStorage } from "@/services/chatStorage";

export interface ToolCall {
  name: string;
  args: Record<string, any>;
  id: string;
}

export interface StreamEvent {
  id: string;
  type: 'tool_call' | 'tool_result' | 'token' | 'error';
  content?: string | Message;
  timestamp: string;
  chunk_id?: number;
  tool_calls?: ToolCall[];
}

interface AgentSteamChunk {
  type: 'token' | 'message';
  content: string | Message;
  chunk_id: number;
}

export function useDataStream({
  apiUrl,
  threadId,
  onError,
}: {
  apiUrl: string;
  threadId: string;
  onError: (error: Error) => void;
}) {
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const chat = chatStorage.loadChats().find(chat => chat.id === threadId);
      return chat?.messages || [];
    } catch (error) {
      console.error("Error loading messages:", error);
      return [];
    }
  });

  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const processedChunkIdsRef = useRef<Set<number>>(new Set());
  const isStreamingTokensRef = useRef<boolean>(false);

  const { token: refreshableToken } = useRefreshableToken();

  useEffect(() => {
    chatStorage.saveChatByThreadId(threadId, messages);
  }, [messages, threadId]);

  useEffect(() => {
    const abortController = new AbortController();

    return () => {
      abortController.abort();
    };
  }, [apiUrl, threadId, refreshableToken]);

  const submit = useCallback(async ({
    messages,
  }: {
    messages: Message[];
  }) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    processedChunkIdsRef.current.clear();

    setIsLoading(true);
    setMessages(messages);
    chatStorage.saveChatByThreadId(threadId, messages);
    setStreamEvents([]);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      
      if (refreshableToken) {
        headers["X-Token"] = refreshableToken;
      }

      const response = await fetch(`${apiUrl}/v1/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: messages[messages.length - 1].content,
          thread_id: threadId || "default-thread",
          session_id: threadId || "default-session",
          user_id: window.USER_DATA.preferred_username,
          stream_tokens: true,
        }),
        signal: abortControllerRef.current.signal,
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

          if (jsonData === '[DONE]' || jsonData === 'DONE') {
            break;
          }

          try {
            const parsedResult = JSON.parse(jsonData) as AgentSteamChunk;
            const { type, content, chunk_id, } = parsedResult;

            if (processedChunkIdsRef.current.has(chunk_id)) {
              console.log(`DEBUG: Skipping duplicate chunk_id: ${chunk_id}`);
              continue;
            }

            if (chunk_id) {
              processedChunkIdsRef.current.add(chunk_id);
            }

            const isStreamingTokens = type === "token" && typeof content === 'string';

            const isSomeCustomAIMessage = type === 'message' && typeof content === 'object' && content.type !== "human";

            if (isSomeCustomAIMessage) {
              isStreamingTokensRef.current = false;
              const toolCallStart = content.type === 'ai' && Array.isArray(content?.tool_calls) && content?.tool_calls?.length > 0;
              const toolCallResult = content.type === 'tool';

              if (toolCallStart) {

                setMessages(prev => [...prev, content]);

              } else if (toolCallResult) {

                setMessages(prev => {
                  const newMessages = [...prev];

                  const toolCallId = content.tool_call_id;

                  if (toolCallId) {
                    newMessages.forEach((message) => {
                      if (message.type === 'ai' && Array.isArray(message?.tool_calls) && message?.tool_calls?.length > 0) {
                        const toolCall = message.tool_calls?.find((toolCall) => toolCall.id === toolCallId);
                        if (toolCall) {
                          (toolCall as any).content = content.content;
                        }
                      }
                    })
                  }

                  return newMessages;
                });
              }
            } else if (isStreamingTokens) {

              if (!isStreamingTokensRef.current) {
                const message: AIMessage = {
                  type: "ai",
                  content: content,
                  tool_calls: [],
                  id: `${Date.now()}-${Math.random()}`,
                };
                setMessages(prev => [...prev, message]);
                isStreamingTokensRef.current = true;
              } else {
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1].content += content;
                  return newMessages;
                });
              }

            }

          } catch (parseError) {
            console.warn("Failed to parse JSON chunk:", jsonData, parseError);
          }
        }
      }

    } catch (error: unknown) {
      if (error instanceof Error) {
        if (error.name !== 'AbortError') {
          console.error("Streaming error:", error);
          onError(error);
        }
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [apiUrl, onError, refreshableToken, threadId]);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsLoading(false);
  }, []);

  return { messages, streamEvents, isLoading, submit, stop, setMessages };
}