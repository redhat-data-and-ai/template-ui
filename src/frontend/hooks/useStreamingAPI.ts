import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AIMessage, Message } from '@langchain/langgraph-sdk';

import type { StreamEvent } from '@/hooks/useDataStream';
import { StreamingManager, type StreamCallback, type StreamStatus } from '@/lib/streaming/StreamingManager';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import {
  appendMessageToChat,
  mergeToolResult,
  selectChatById,
  selectStreamingState,
  updateChat,
  updateLastMessageInChat,
  updateStreamingState,
  type StreamingState,
} from '@/redux/slices/chats';
import { chatStorage } from '@/services/chatStorage';
import { selectActiveRules, selectMemories } from '@/redux/slices/personalization';
import { isSubAgentToolCall, extractSubAgentName } from '@/types/deep-agent';

function cloneMessages(messages: Message[]): Message[] {
  return messages.map((m) => JSON.parse(JSON.stringify(m)) as Message);
}

function serializeLastMessage(messages: Message[]): string {
  const last = messages[messages.length - 1];
  if (!last) {
    return '';
  }
  return typeof last.content === 'string' ? last.content : JSON.stringify(last.content);
}

const EMPTY_MESSAGES: Message[] = [];

function nextStreamingPartialForStatus(status: StreamStatus): Partial<StreamingState> | null {
  switch (status) {
    case 'connecting':
      return {
        isLoading: true,
        isConnected: false,
        error: null,
        isThinking: false,
      };
    case 'streaming':
      return {
        isConnected: true,
        isLoading: true,
      };
    case 'idle':
      return {
        isLoading: false,
        isConnected: false,
        error: null,
        isThinking: false,
        currentRunId: null,
      };
    case 'cancelled':
      return {
        isLoading: false,
        isConnected: false,
        error: null,
      };
    case 'error':
      return null;
  }
}

export function useStreamingAPI(threadId: string) {
  const dispatch = useAppDispatch();
  const chat = useAppSelector((state) => selectChatById(state, threadId));
  const streamingState = useAppSelector((state) => selectStreamingState(state, threadId));

  const memories = useAppSelector(selectMemories);
  const activeRules = useAppSelector(selectActiveRules);

  const messages = useMemo(() => chat?.messages ?? EMPTY_MESSAGES, [chat?.messages]);

  const [streamEvents] = useState<StreamEvent[]>([]);

  const managerRef = useRef<StreamingManager | null>(null);
  const isStreamingTokensRef = useRef<boolean>(false);
  const isActiveRef = useRef(true);

  if (!managerRef.current) {
    managerRef.current = new StreamingManager();
  }

  useEffect(() => {
    isActiveRef.current = true;
    const manager = managerRef.current;
    return () => {
      isActiveRef.current = false;
      setTimeout(() => {
        if (!isActiveRef.current) manager?.cancel();
      }, 50);
    };
  }, []);

  useEffect(() => {
    if (!threadId) return;
    chatStorage.saveChatByThreadId(threadId, messages);
  }, [messages, threadId]);

  const setMessages = useCallback(
    (msgs: Message[]) => {
      const next = cloneMessages(msgs);
      dispatch(updateChat({ id: threadId, updates: { messages: next } }));
      chatStorage.saveChatByThreadId(threadId, next);
      isStreamingTokensRef.current = false;
    },
    [dispatch, threadId],
  );

  const submit = useCallback(
    async ({ messages: submitted }: { messages: Message[] }) => {
      const manager = managerRef.current;
      if (!manager || !threadId) return;

      isStreamingTokensRef.current = false;

      const clones = cloneMessages(submitted);
      dispatch(updateChat({ id: threadId, updates: { messages: clones } }));
      chatStorage.saveChatByThreadId(threadId, clones);

      const messageText = serializeLastMessage(clones);
      if (messageText === '') return;

      const token = typeof window.USER_DATA.accessToken === 'string' ? window.USER_DATA.accessToken : undefined;
      const userId =
        typeof window.USER_DATA.preferred_username === 'string'
          ? window.USER_DATA.preferred_username
          : '';
      const apiUrl = typeof window.APP_DATA?.apiUrl === 'string' ? window.APP_DATA.apiUrl : '';

      dispatch(
        updateStreamingState({
          chatId: threadId,
          state: {
            currentRunId: `run-${Date.now()}`,
            error: null,
            pendingInterrupt: null,
            taskSteps: [],
          },
        }),
      );

      const callbacks: StreamCallback = {
        onToken(content) {
          if (!isStreamingTokensRef.current) {
            const message: AIMessage = {
              type: 'ai',
              content,
              tool_calls: [],
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            };
            dispatch(appendMessageToChat({ chatId: threadId, message }));
            isStreamingTokensRef.current = true;
            return;
          }
          dispatch(updateLastMessageInChat({ chatId: threadId, content }));
        },
        onMessage(m) {
          isStreamingTokensRef.current = false;
          if (m.type === 'human') {
            return;
          }

          const isToolCallingAi =
            m.type === 'ai' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
          if (isToolCallingAi) {
            dispatch(appendMessageToChat({ chatId: threadId, message: m }));

            const subAgentTc = m.tool_calls?.find((tc: { name: string; args?: Record<string, unknown> }) =>
              isSubAgentToolCall(tc),
            );
            if (subAgentTc) {
              dispatch(
                updateStreamingState({
                  chatId: threadId,
                  state: {
                    activeSubAgent: {
                      name: extractSubAgentName(subAgentTc),
                      toolCallId: subAgentTc.id ?? '',
                      status: 'delegating',
                      startedAt: Date.now(),
                    },
                  },
                }),
              );
            }
            return;
          }

          if (m.type === 'tool') {
            dispatch(
              mergeToolResult({
                chatId: threadId,
                toolCallId: m.tool_call_id,
                content: m.content,
              }),
            );
            dispatch(
              updateStreamingState({
                chatId: threadId,
                state: { activeSubAgent: null },
              }),
            );
          }
        },
        onInterrupt(interrupt) {
          dispatch(
            updateStreamingState({
              chatId: threadId,
              state: { pendingInterrupt: interrupt },
            }),
          );
        },
        onError(error) {
          dispatch(
            updateStreamingState({
              chatId: threadId,
              state: {
                error: error.message,
                isLoading: false,
                isConnected: false,
              },
            }),
          );
        },
        onStatusChange(status) {
          if (status === 'error') {
            return;
          }
          const partial = nextStreamingPartialForStatus(status);
          if (partial) {
            dispatch(updateStreamingState({ chatId: threadId, state: partial }));
          }
        },
        onDone() {},
      };

      await manager.stream(
        {
          message: messageText,
          threadId,
          userId,
          apiUrl,
          token,
          memories: memories.map((m) => m.content),
          rules: activeRules.map((r) => r.content),
        },
        callbacks,
      );
    },
    [dispatch, threadId, memories, activeRules],
  );

  const stop = useCallback(() => {
    managerRef.current?.cancel();
    dispatch(
      updateStreamingState({
        chatId: threadId,
        state: {
          isLoading: false,
          isConnected: false,
          isThinking: false,
        },
      }),
    );
  }, [dispatch, threadId]);

  return {
    messages,
    streamEvents,
    isLoading: streamingState.isLoading,
    pendingInterrupt: streamingState.pendingInterrupt,
    taskSteps: streamingState.taskSteps,
    submit,
    stop,
    setMessages,
  };
}
