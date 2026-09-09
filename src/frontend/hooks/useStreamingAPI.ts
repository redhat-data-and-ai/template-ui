import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AIMessage, Message } from '@langchain/langgraph-sdk';

import type { StreamEvent } from '@/hooks/useDataStream';
import {
  type StreamingManager,
  type InterruptPayload,
  type StreamCallback,
  type StreamStatus,
} from '@/lib/streaming/StreamingManager';
import { getStreamingManager } from '@/lib/streaming/streamingManagerRegistry';
import { useAppDispatch, useAppSelector } from '@/redux/hooks';
import type { AppDispatch } from '@/redux/store';
import {
  appendMessageToChat,
  removeLastMessageFromChat,
  mergeToolResult,
  resolveAllPendingToolCalls,
  selectChatById,
  selectStreamingState,
  updateChat,
  updateLastMessageInChat,
  updateStreamingState,
  type StreamingState,
} from '@/redux/slices/chats';
import { chatStorage } from '@/services/chatStorage';
import { getThreadState, getThreadStateAndInterrupt } from '@/services/agent-rest';
import { buildAppPath } from '@/lib/app-paths';
import { addToast } from '@/redux/slices/toasts';
import { assignThreadToProjectThunk } from '@/redux/slices/projects';
import { isClientCreatedChat } from '@/services/newChatTracker';
import { selectAlwaysAllowedTools } from '@/redux/slices/userSettings';
import { isSubAgentToolCall, extractSubAgentName } from '@/types/deep-agent';
import type { HITLInterruptValue, InterruptInfo } from '@/types/deep-agent';
import { mergeMessageWithMcpModelContext } from '@/types/mcp-apps';


function enrichInterrupt(interrupt: InterruptPayload): InterruptInfo {
  const raw = interrupt.value as string | HITLInterruptValue;
  if (typeof raw === 'object' && raw !== null && (raw as { type?: string }).type === 'mcp_auth_required') {
    return { ...interrupt, value: raw, payload: raw as unknown as NonNullable<InterruptInfo['payload']> };
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (
        parsed
        && typeof parsed === 'object'
        && (parsed as { type?: string }).type === 'mcp_auth_required'
      ) {
        return { ...interrupt, value: raw, payload: parsed as NonNullable<InterruptInfo['payload']> };
      }
    } catch {
      // plain-text interrupt
    }
  }
  return { ...interrupt, value: raw };
}

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

/** MR-56: max automatic retries after the first failed stream attempt */
export const MAX_RETRIES = 3;
/** MR-56: base delay for exponential backoff (ms) */
const BASE_DELAY_MS = 5000;
/** MR-63: idle threshold before marking stream as stale (ms) */
const STALE_THRESHOLD_MS = 30000;
/** Time threshold for refetching history on reconnect (ms) */
const HISTORY_REFETCH_THRESHOLD_MS = 10000;
/** Poll interval when waiting for a recovered run to complete (ms) */
const RECOVERY_POLL_INTERVAL_MS = 5000;
/** Max time to poll for recovery before giving up (ms) */
export const RECOVERY_POLL_TIMEOUT_MS = 120000;

function computeRetryDelayMs(retryAttemptNumber: number): number {
  const capped = Math.min(BASE_DELAY_MS * 2 ** retryAttemptNumber, 30000);
  const jitter = Math.random() * Math.min(capped * 0.25, 7500);
  return Math.floor(Math.min(capped + jitter, 30000));
}

async function isAgentReachable(): Promise<boolean> {
  try {
    const res = await fetch(buildAppPath('/api/health/agent'), {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return false;
    const data = await res.json() as { status?: string };
    return data.status !== 'unhealthy' && data.status !== 'unreachable';
  } catch {
    return false;
  }
}

function isRecoverableStreamError(error: Error): boolean {
  if (error.name === 'AbortError') return false;
  const msg = error.message;
  const httpMatch = msg.match(/HTTP error! status:\s*(\d+)/i);
  if (httpMatch) {
    const code = Number.parseInt(httpMatch[1], 10);
    if (code === 429) return true;
    if (code >= 400 && code < 500) return false;
    if (code >= 500) return true;
  }
  if (error instanceof TypeError) return true;
  const lower = msg.toLowerCase();
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    lower.includes('network request failed')
  ) {
    return true;
  }
  return false;
}

function _tryReplayQueuedDecision(threadId: string): Array<{ type: 'approve' | 'reject'; message?: string }> | null {
  try {
    const raw = localStorage.getItem(`pending-decision:${threadId}`);
    if (!raw) return null;
    const { decisions, timestamp } = JSON.parse(raw) as {
      decisions: Array<{ type: 'approve' | 'reject'; message?: string }>;
      timestamp: number;
    };
    if (Date.now() - timestamp > 5 * 60 * 1000) {
      localStorage.removeItem(`pending-decision:${threadId}`);
      return null;
    }
    return decisions;
  } catch {
    return null;
  }
}

export function _startRecoveryPolling(
  threadId: string,
  dispatch: AppDispatch,
  onRecovered: (msgs: Message[]) => void,
  intervalRef: React.MutableRefObject<ReturnType<typeof setInterval> | null>,
  deadlineRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  wasInterruptedRef: React.MutableRefObject<boolean>,
  pollIntervalMs: number,
  timeoutMs: number,
) {
  if (intervalRef.current) clearInterval(intervalRef.current);
  if (deadlineRef.current) clearTimeout(deadlineRef.current);
  wasInterruptedRef.current = true;
  let polling = false;
  let expired = false;

  deadlineRef.current = setTimeout(() => {
    expired = true;
    deadlineRef.current = null;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    dispatch(updateStreamingState({
      chatId: threadId,
      state: {
        isLoading: false,
        isConnected: false,
        isReconnecting: false,
        reconnectAttempt: 0,
        error: 'Agent is unavailable. Please try again.',
      },
    }));
  }, timeoutMs);

  const myInterval = intervalRef.current = setInterval(async () => {
    if (polling || expired) return;
    polling = true;
    try {
      const { messages: msgs, interrupt } = await getThreadStateAndInterrupt(threadId);
      if (expired || intervalRef.current !== myInterval) return;
      if (interrupt) {
        if (deadlineRef.current) { clearTimeout(deadlineRef.current); deadlineRef.current = null; }
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        wasInterruptedRef.current = false;
        dispatch(updateStreamingState({
          chatId: threadId,
          state: {
            pendingInterrupt: {
              value: interrupt.value as any,
              resumable: interrupt.resumable,
            },
            isLoading: false,
          },
        }));
        return;
      }

      if (msgs.length === 0) return;
      const lastMsg = msgs[msgs.length - 1];
      if (lastMsg.type === 'ai' && lastMsg.content) {
        if (deadlineRef.current) { clearTimeout(deadlineRef.current); deadlineRef.current = null; }
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        wasInterruptedRef.current = false;
        onRecovered(msgs);
      }
    } catch {
      // Agent still down — keep polling
    } finally {
      polling = false;
    }
  }, pollIntervalMs);
}

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

  const alwaysAllowedTools = useAppSelector(selectAlwaysAllowedTools);

  const messages = useMemo(() => chat?.messages ?? EMPTY_MESSAGES, [chat?.messages]);
  // Keep messagesRef in sync for recovery polling
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const [streamEvents] = useState<StreamEvent[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [isStreamStale, setIsStreamStale] = useState(false);
  const [wasInterrupted, setWasInterruptedState] = useState(false);
  const setWasInterrupted = useCallback((v: boolean) => { wasInterruptedRef.current = v; setWasInterruptedState(v); }, []);
  const [mcpEvents, setMcpEvents] = useState<Array<{ tool: string; status: string; timestamp: number }>>([]);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [lastStreamTiming, setLastStreamTiming] = useState<{
    streamStartTime: number;
    firstTokenTime: number | null;
    streamEndTime: number;
    timeToFirstTokenMs: number | null;
    totalDurationMs: number;
  } | null>(null);

  const managerRef = useRef<StreamingManager | null>(null);
  const streamClockRef = useRef<{
    streamStartTime: number | null;
    firstTokenTime: number | null;
    streamEndTime: number | null;
  }>({ streamStartTime: null, firstTokenTime: null, streamEndTime: null });
  const isStreamingTokensRef = useRef<boolean>(false);
  const userCancelledRef = useRef(false);
  const streamEndedWithInterruptRef = useRef(false);
  const pendingInterruptRef = useRef(streamingState.pendingInterrupt);
  pendingInterruptRef.current = streamingState.pendingInterrupt;
  const lastStreamErrorRef = useRef<Error | null>(null);
  const lastTokenTimeRef = useRef<number>(0);
  const staleIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSuccessfulConnectionRef = useRef<number>(Date.now());
  const threadIdRef = useRef(threadId);
  threadIdRef.current = threadId;
  const chatRef = useRef(chat);
  chatRef.current = chat;
  const wasInterruptedRef = useRef(false);
  const messagesRef = useRef<Message[]>(EMPTY_MESSAGES);
  const recoveryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recoveryDeadlineRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const clearReconnectTimers = useCallback(() => {
    for (const id of reconnectTimersRef.current) clearTimeout(id);
    reconnectTimersRef.current = [];
  }, []);

  if (!managerRef.current) {
    managerRef.current = getStreamingManager(threadId);
  }

  const handleStreamActivityStatus = useCallback((status: StreamStatus) => {
    if (status === 'connecting' || status === 'streaming') {
      if (staleIntervalRef.current != null) {
        clearInterval(staleIntervalRef.current);
        staleIntervalRef.current = null;
      }
      lastTokenTimeRef.current = Date.now();
      staleIntervalRef.current = setInterval(() => {
        const mgr = managerRef.current;
        const st = mgr?.getStatus();
        if (st !== 'connecting' && st !== 'streaming') {
          return;
        }
        if (Date.now() - lastTokenTimeRef.current > STALE_THRESHOLD_MS) {
          setIsStreamStale(true);
          console.warn(
            '[useStreamingAPI] No stream activity for over 30s while connected; the stream may be stalled.',
          );
        }
      }, 1000);
      return;
    }
    if (status === 'idle' || status === 'error' || status === 'cancelled') {
      if (staleIntervalRef.current != null) {
        clearInterval(staleIntervalRef.current);
        staleIntervalRef.current = null;
      }
      setIsStreamStale(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      clearReconnectTimers();
      if (recoveryIntervalRef.current) {
        clearInterval(recoveryIntervalRef.current);
        recoveryIntervalRef.current = null;
      }
      if (recoveryDeadlineRef.current) {
        clearTimeout(recoveryDeadlineRef.current);
        recoveryDeadlineRef.current = null;
      }
      if (staleIntervalRef.current != null) {
        clearInterval(staleIntervalRef.current);
        staleIntervalRef.current = null;
      }
    };
  }, [clearReconnectTimers]);

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
    async ({
      messages: submitted,
      mcpModelContext,
    }: {
      messages: Message[];
      /** One-shot MCP App context (ui/update-model-context); not stored in the chat bubble. */
      mcpModelContext?: string | null;
    }) => {
      const manager = managerRef.current;
      if (!manager || !threadId) return;

      userCancelledRef.current = false;
      setRetryCount(0);
      setWasInterrupted(false);
      const initialMessageCount = messagesRef.current.length;

      // Clear any pending reconnect timers and recovery poller from previous run.
      clearReconnectTimers();
      if (recoveryIntervalRef.current) {
        clearInterval(recoveryIntervalRef.current);
        recoveryIntervalRef.current = null;
      }
      if (recoveryDeadlineRef.current) {
        clearTimeout(recoveryDeadlineRef.current);
        recoveryDeadlineRef.current = null;
      }
      setIsStreamStale(false);
      setMcpEvents([]);
      setTraceId(null);
      setLastStreamTiming(null);
      streamClockRef.current = {
        streamStartTime: null,
        firstTokenTime: null,
        streamEndTime: null,
      };
      if (staleIntervalRef.current != null) {
        clearInterval(staleIntervalRef.current);
        staleIntervalRef.current = null;
      }

      isStreamingTokensRef.current = false;

      const clones = cloneMessages(submitted);
      dispatch(updateChat({ id: threadId, updates: { messages: clones } }));
      chatStorage.saveChatByThreadId(threadId, clones);

      const messageText = mergeMessageWithMcpModelContext(
        serializeLastMessage(clones),
        mcpModelContext,
      );
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

      const streamRequest = {
        message: messageText,
        threadId,
        userId,
        apiUrl,
        token,
        projectId: chatRef.current?.project_id,
      };
      const wasClientCreated = isClientCreatedChat(threadId);

      let _lastOutcome: 'success' | 'cancelled' | 'failed' = 'failed';
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (userCancelledRef.current) {
          break;
        }

        // Update reconnection state on retry
        if (attempt > 0) {
          dispatch(
            updateStreamingState({
              chatId: threadId,
              state: {
                isReconnecting: true,
                reconnectAttempt: attempt,
                streamDroppedMidResponse: isStreamingTokensRef.current,
              },
            }),
          );

          // Remove incomplete AI message if stream dropped mid-response
          if (isStreamingTokensRef.current) {
            dispatch(updateChat({ id: threadId, updates: { messages: clones } }));
            isStreamingTokensRef.current = false;
          }
        }

        // Refetch conversation history on reconnect if connection was lost for > 10s
        if (attempt > 0 && Date.now() - lastSuccessfulConnectionRef.current > HISTORY_REFETCH_THRESHOLD_MS) {
          try {
            const history = await getThreadState(threadId);
            if (history.length > 0) {
              const pendingMsg = clones[clones.length - 1];
              const serverHasPending =
                pendingMsg?.type === 'human' &&
                history.some((m) => m.type === 'human' && m.content === pendingMsg.content);
              const merged = serverHasPending ? history : [...history, pendingMsg];
              dispatch(updateChat({ id: threadId, updates: { messages: merged } }));
            }
          } catch (err) {
            console.warn('[useStreamingAPI] Failed to refetch conversation history on reconnect', err);
          }
        }

        type StreamOutcome = 'success' | 'cancelled' | 'failed';
        const outcome = await new Promise<StreamOutcome>((resolve) => {
          let settled = false;
          const finish = (r: StreamOutcome) => {
            if (settled) return;
            settled = true;
            resolve(r);
          };

          lastStreamErrorRef.current = null;
          streamEndedWithInterruptRef.current = false;

          const callbacks: StreamCallback = {
            onToken(content) {
              lastTokenTimeRef.current = Date.now();
              lastSuccessfulConnectionRef.current = Date.now();
              setIsStreamStale(false);
              if (streamClockRef.current.firstTokenTime == null) {
                streamClockRef.current.firstTokenTime = Date.now();
              }
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
            onDraftDiscard() {
              if (isStreamingTokensRef.current) {
                dispatch(removeLastMessageFromChat({ chatId: threadId }));
                isStreamingTokensRef.current = false;
              }
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
                    status: (m as Record<string, unknown>).status as string | undefined,
                    mcpApp: (m as { mcpApp?: Record<string, unknown> }).mcpApp,
                    artifact: (m as { artifact?: unknown }).artifact,
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
              streamEndedWithInterruptRef.current = true;
              dispatch(
                updateStreamingState({
                  chatId: threadId,
                  state: { pendingInterrupt: enrichInterrupt(interrupt) },
                }),
              );
            },
            async onError(error) {
              lastStreamErrorRef.current = error;
              if (!recoveryIntervalRef.current && threadId) {
                const pollStart = Date.now();
                let polling = false;
                recoveryIntervalRef.current = setInterval(async () => {
                  if (polling) return;
                  if (!recoveryIntervalRef.current || userCancelledRef.current || !threadId) return;
                  if (Date.now() - pollStart > RECOVERY_POLL_TIMEOUT_MS) {
                    const id = recoveryIntervalRef.current;
                    recoveryIntervalRef.current = null;
                    if (id) clearInterval(id);
                    dispatch(updateStreamingState({
                      chatId: threadId,
                      state: {
                        isLoading: false,
                        isConnected: false,
                        isReconnecting: false,
                        reconnectAttempt: 0,
                        error: 'Agent is unavailable. Please try again.',
                      },
                    }));
                    return;
                  }
                  polling = true;
                  try {
                    const { messages: serverMsgs, interrupt } = await getThreadStateAndInterrupt(threadId);

                    if (interrupt) {
                      const intervalId = recoveryIntervalRef.current;
                      recoveryIntervalRef.current = null;
                      if (intervalId) clearInterval(intervalId);
                      messagesRef.current = serverMsgs;
                      dispatch(updateChat({ id: threadId, updates: { messages: serverMsgs } }));

                      const queued = _tryReplayQueuedDecision(threadId);
                      if (queued) {
                        dispatch(updateStreamingState({
                          chatId: threadId,
                          state: { error: null, isLoading: true, isConnected: false, isReconnecting: false, reconnectAttempt: 0 },
                        }));
                        resumeWithDecisionsRef.current(queued).catch(() => {});
                      } else {
                        dispatch(updateStreamingState({
                          chatId: threadId,
                          state: {
                            error: null, isLoading: false, isConnected: false,
                            isReconnecting: false, reconnectAttempt: 0,
                            pendingInterrupt: {
                              value: interrupt.value as any,
                              resumable: interrupt.resumable,
                            },
                          },
                        }));
                      }
                      setWasInterrupted(false);
                    } else if (serverMsgs.length > initialMessageCount && serverMsgs.length > messagesRef.current.length) {
                      messagesRef.current = serverMsgs;
                      dispatch(updateChat({ id: threadId, updates: { messages: serverMsgs } }));
                      dispatch(resolveAllPendingToolCalls({ chatId: threadId }));
                      const last = serverMsgs[serverMsgs.length - 1];
                      const isFinalResponse = last?.type === 'ai' && last.content &&
                        (!Array.isArray((last as any).tool_calls) || (last as any).tool_calls.length === 0);
                      if (isFinalResponse) {
                        const intervalId = recoveryIntervalRef.current;
                        recoveryIntervalRef.current = null;
                        if (intervalId) clearInterval(intervalId);
                        managerRef.current?.cancel();
                        dispatch(updateStreamingState({
                          chatId: threadId,
                          state: { error: null, isLoading: false, isConnected: false, isReconnecting: false, reconnectAttempt: 0 },
                        }));
                        setWasInterrupted(false);
                      }
                    }
                  } catch {
                    // Server may be unreachable during pod replacement
                  } finally {
                    polling = false;
                  }
                }, RECOVERY_POLL_INTERVAL_MS);
              }
              const agentUp = await isAgentReachable();
              const canRetry =
                agentUp && isRecoverableStreamError(error) && attempt < MAX_RETRIES && !userCancelledRef.current;
              if (canRetry) {
                dispatch(
                  updateStreamingState({
                    chatId: threadId,
                    state: {
                      error: null,
                      isLoading: true,
                      isConnected: false,
                    },
                  }),
                );
              } else if (!agentUp) {
                const tid = threadIdRef.current;
                const dropped = isStreamingTokensRef.current;
                clearReconnectTimers();
                for (let step = 1; step <= MAX_RETRIES; step++) {
                  const s = step;
                  const timerId = setTimeout(() => {
                    if (userCancelledRef.current) return;
                    dispatch(
                      updateStreamingState({
                        chatId: tid,
                        state: {
                          error: null,
                          isLoading: true,
                          isConnected: false,
                          isReconnecting: true,
                          reconnectAttempt: s,
                          streamDroppedMidResponse: dropped,
                        },
                      }),
                    );
                  }, (s - 1) * 15000);
                  reconnectTimersRef.current.push(timerId);
                }
                setWasInterrupted(true);
              } else {
                dispatch(resolveAllPendingToolCalls({ chatId: threadId, status: 'error', errorMessage: error.message }));
                dispatch(
                  updateStreamingState({
                    chatId: threadId,
                    state: {
                      error: error.message,
                      isLoading: false,
                      isConnected: false,
                      isReconnecting: false,
                      reconnectAttempt: 0,
                      streamDroppedMidResponse: false,
                    },
                  }),
                );
                setWasInterrupted(true);
              }
              finish('failed');
            },
            onStatusChange(status) {
              if (status === 'connecting') {
                setLastStreamTiming(null);
                streamClockRef.current.streamStartTime = Date.now();
                streamClockRef.current.firstTokenTime = null;
                streamClockRef.current.streamEndTime = null;
              }
              if (status === 'idle' || status === 'cancelled' || status === 'error') {
                const end = Date.now();
                streamClockRef.current.streamEndTime = end;
                const { streamStartTime, firstTokenTime } = streamClockRef.current;
                if (streamStartTime != null) {
                  setLastStreamTiming({
                    streamStartTime,
                    firstTokenTime,
                    streamEndTime: end,
                    timeToFirstTokenMs:
                      firstTokenTime != null ? firstTokenTime - streamStartTime : null,
                    totalDurationMs: end - streamStartTime,
                  });
                }
              }
              if (status === 'cancelled') {
                finish('cancelled');
              }
              handleStreamActivityStatus(status);
              if (status === 'error') {
                return;
              }
              const partial = nextStreamingPartialForStatus(status);
              if (partial) {
                dispatch(updateStreamingState({ chatId: threadId, state: partial }));
              }
            },
            onDone() {
              if (!streamEndedWithInterruptRef.current) {
                dispatch(resolveAllPendingToolCalls({ chatId: threadId }));
              }
              lastSuccessfulConnectionRef.current = Date.now();
              const gotFullResponse = messagesRef.current.length > initialMessageCount + 1;
              if (gotFullResponse && recoveryIntervalRef.current) {
                clearInterval(recoveryIntervalRef.current);
                recoveryIntervalRef.current = null;
              } else if (!gotFullResponse && !recoveryIntervalRef.current && threadId) {
                const pollStart = Date.now();
                let polling = false;
                recoveryIntervalRef.current = setInterval(async () => {
                  if (polling) return;
                  if (!recoveryIntervalRef.current || userCancelledRef.current || !threadId) return;
                  if (Date.now() - pollStart > RECOVERY_POLL_TIMEOUT_MS) {
                    const id = recoveryIntervalRef.current;
                    recoveryIntervalRef.current = null;
                    if (id) clearInterval(id);
                    dispatch(updateStreamingState({
                      chatId: threadId,
                      state: {
                        isLoading: false,
                        isConnected: false,
                        isReconnecting: false,
                        reconnectAttempt: 0,
                        error: 'Agent is unavailable. Please try again.',
                      },
                    }));
                    return;
                  }
                  polling = true;
                  try {
                    const { messages: serverMsgs, interrupt } = await getThreadStateAndInterrupt(threadId);

                    if (interrupt) {
                      const intervalId = recoveryIntervalRef.current;
                      recoveryIntervalRef.current = null;
                      if (intervalId) clearInterval(intervalId);
                      messagesRef.current = serverMsgs;
                      dispatch(updateChat({ id: threadId, updates: { messages: serverMsgs } }));
                      dispatch(updateStreamingState({
                        chatId: threadId,
                        state: {
                          error: null, isLoading: false, isConnected: false,
                          isReconnecting: false, reconnectAttempt: 0,
                          pendingInterrupt: {
                            value: interrupt.value as any,
                            resumable: interrupt.resumable,
                          },
                        },
                      }));
                      setWasInterrupted(false);
                    } else if (serverMsgs.length > initialMessageCount && serverMsgs.length > messagesRef.current.length) {
                      const intervalId = recoveryIntervalRef.current;
                      recoveryIntervalRef.current = null;
                      if (intervalId) clearInterval(intervalId);
                      managerRef.current?.cancel();
                      messagesRef.current = serverMsgs;
                      dispatch(updateChat({ id: threadId, updates: { messages: serverMsgs } }));
                      dispatch(resolveAllPendingToolCalls({ chatId: threadId }));
                      dispatch(updateStreamingState({
                        chatId: threadId,
                        state: { error: null, isLoading: false, isConnected: false, isReconnecting: false, reconnectAttempt: 0 },
                      }));
                      setWasInterrupted(false);
                    }
                  } catch { /* keep polling */ }
                  finally { polling = false; }
                }, RECOVERY_POLL_INTERVAL_MS);
              }
              if (gotFullResponse) {
                dispatch(
                  updateStreamingState({
                    chatId: threadId,
                    state: {
                      isLoading: false,
                      isConnected: false,
                      isReconnecting: false,
                      reconnectAttempt: 0,
                      streamDroppedMidResponse: false,
                    },
                  }),
                );
              } else {
                dispatch(
                  updateStreamingState({
                    chatId: threadId,
                    state: {
                      isLoading: true,
                      isConnected: false,
                      isReconnecting: true,
                      reconnectAttempt: 1,
                      streamDroppedMidResponse: isStreamingTokensRef.current,
                    },
                  }),
                );
              }
              finish(gotFullResponse ? 'success' : 'failed');
            },
            onMcpStatus(evt) {
              setMcpEvents((prev) => [...prev, evt]);
            },
            onMetadata(data) {
              setTraceId(data.trace_id);
            },
          };

          manager.stream(
            { ...streamRequest, projectId: chatRef.current?.project_id },
            callbacks,
          ).then(() => {
            if (!settled) {
              if (!streamEndedWithInterruptRef.current) {
                dispatch(resolveAllPendingToolCalls({ chatId: threadId }));
              }
              finish('success');
            }
          });
        });

        _lastOutcome = outcome;
        if (outcome === 'success' || outcome === 'cancelled') {
          break;
        }

        const err = lastStreamErrorRef.current;
        if (
          !err ||
          !isRecoverableStreamError(err) ||
          attempt >= MAX_RETRIES ||
          userCancelledRef.current
        ) {
          // Stream failed after all retries — start recovery polling
          // The agent may recover (LeaseReaper) and complete the run;
          // poll thread state until the response appears or timeout
          if (err && !userCancelledRef.current) {
            _startRecoveryPolling(threadIdRef.current, dispatch, (msgs) => {
              if (msgs.length > 0) {
                dispatch(updateChat({
                  id: threadIdRef.current,
                  updates: { messages: msgs },
                }));
                setMessages(msgs.map(m => JSON.parse(JSON.stringify(m))));
                dispatch(updateStreamingState({
                  chatId: threadIdRef.current,
                  state: { isLoading: false, error: null },
                }));
              }
            }, recoveryIntervalRef, recoveryDeadlineRef, wasInterruptedRef, RECOVERY_POLL_INTERVAL_MS, RECOVERY_POLL_TIMEOUT_MS);
          }
          break;
        }

        setRetryCount(attempt + 1);
        await new Promise<void>((r) => setTimeout(r, computeRetryDelayMs(attempt + 1)));
      }

      if (_lastOutcome === 'success' && wasClientCreated) {
        const pid = chatRef.current?.project_id;
        if (pid) {
          void dispatch(assignThreadToProjectThunk({ threadId, projectId: pid }))
            .unwrap()
            .catch(() => {
              dispatch(addToast({ title: 'Failed to move conversation', variant: 'danger' }));
            });
        }
      }

      // After all retries: start a fallback recovery poller ONLY if
      // the stream failed (not on normal completions — that would waste
      // a getThreadState call on every successful message exchange).
      if (threadId && !userCancelledRef.current && !recoveryIntervalRef.current && _lastOutcome === 'failed') {
        const pollStart = Date.now();
        let polling = false;
        recoveryIntervalRef.current = setInterval(async () => {
          if (polling) return;
          if (!recoveryIntervalRef.current || userCancelledRef.current || !threadId) return;
          if (Date.now() - pollStart > RECOVERY_POLL_TIMEOUT_MS) {
            const id = recoveryIntervalRef.current;
            recoveryIntervalRef.current = null;
            if (id) clearInterval(id);
            dispatch(updateStreamingState({
              chatId: threadId,
              state: {
                isLoading: false,
                isConnected: false,
                isReconnecting: false,
                reconnectAttempt: 0,
                error: 'Agent is unavailable. Please try again.',
              },
            }));
            return;
          }
          polling = true;
          try {
            const serverMsgs = await getThreadState(threadId);
            if (serverMsgs.length > messagesRef.current.length) {
              const id = recoveryIntervalRef.current;
              recoveryIntervalRef.current = null;
              if (id) clearInterval(id);
              managerRef.current?.cancel();
              messagesRef.current = serverMsgs;
              dispatch(updateChat({ id: threadId, updates: { messages: serverMsgs } }));
              dispatch(resolveAllPendingToolCalls({ chatId: threadId }));
              dispatch(updateStreamingState({ chatId: threadId, state: { error: null, isLoading: false, isConnected: false } }));
              setWasInterrupted(false);
            }
          } catch { /* keep polling */ }
          finally { polling = false; }
        }, RECOVERY_POLL_INTERVAL_MS);
      }
    },
    [dispatch, threadId, handleStreamActivityStatus, clearReconnectTimers, setMessages, setWasInterrupted],
  );

  /**
   * Check an incoming interrupt value against the always-allowed list.
   * Returns true if ALL action requests are auto-approved so the caller
   * can skip showing the banner entirely.
   */
  const checkAndAutoApprove = useCallback(
    (interruptValue: HITLInterruptValue): { allAutoApproved: boolean; decisions: Array<{ type: 'approve' | 'reject' }> } => {
      const allowed = new Set(alwaysAllowedTools);
      const decisions = interruptValue.action_requests.map((req) => {
        const subagentType = typeof req.args?.subagent_type === 'string' ? req.args.subagent_type : null;
        const isAllowed = allowed.has(req.name) || (subagentType !== null && allowed.has(subagentType));
        return { type: (isAllowed ? 'approve' : null) as 'approve' | null };
      });
      const allAutoApproved = decisions.every((d) => d.type === 'approve');
      return {
        allAutoApproved,
        decisions: decisions.map((d) => ({ type: d.type ?? 'approve' })),
      };
    },
    [alwaysAllowedTools],
  );

  /**
   * Resume a paused LangGraph run with an array of HITL decisions.
   * Sends resume=true + decisions to the BFF which forwards as
   * Command(resume={"decisions": [...]}) to Aegra.
   */
  const resumeWithDecisions = useCallback(
    async (decisions: Array<{ type: 'approve' | 'reject'; message?: string }>) => {
      const manager = managerRef.current;
      if (!manager || !threadId) return;

      const savedInterrupt = pendingInterruptRef.current;
      dispatch(updateStreamingState({ chatId: threadId, state: { pendingInterrupt: null } }));

      const token = typeof window.USER_DATA.accessToken === 'string' ? window.USER_DATA.accessToken : undefined;
      const userId =
        typeof window.USER_DATA.preferred_username === 'string'
          ? window.USER_DATA.preferred_username
          : '';
      const apiUrl = typeof window.APP_DATA?.apiUrl === 'string' ? window.APP_DATA.apiUrl : '';

      dispatch(
        updateStreamingState({
          chatId: threadId,
          state: { currentRunId: `run-${Date.now()}`, error: null, taskSteps: [] },
        }),
      );

      const resumeRequest = {
        message: '',
        threadId,
        userId,
        apiUrl,
        token,
        resume: true,
        resumeDecisions: decisions,
      };

      let resumeStreamHadInterrupt = false;
      let resumeStreamHadError = false;

      const callbacks: StreamCallback = {
        onToken(content) {
          lastTokenTimeRef.current = Date.now();
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
        onDraftDiscard() {
          if (isStreamingTokensRef.current) {
            dispatch(removeLastMessageFromChat({ chatId: threadId }));
            isStreamingTokensRef.current = false;
          }
        },
        onMessage(m) {
          isStreamingTokensRef.current = false;
          if (m.type === 'human') return;
          if (m.type === 'ai' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
            dispatch(appendMessageToChat({ chatId: threadId, message: m }));
            return;
          }
          if (m.type === 'tool') {
            dispatch(
              mergeToolResult({
                chatId: threadId,
                toolCallId: m.tool_call_id,
                content: m.content,
                status: (m as Record<string, unknown>).status as string | undefined,
                mcpApp: (m as { mcpApp?: Record<string, unknown> }).mcpApp,
                artifact: (m as { artifact?: unknown }).artifact,
              }),
            );
            dispatch(updateStreamingState({ chatId: threadId, state: { activeSubAgent: null } }));
          }
        },
        onInterrupt(interrupt) {
          resumeStreamHadInterrupt = true;
          dispatch(updateStreamingState({ chatId: threadId, state: { pendingInterrupt: enrichInterrupt(interrupt) } }));
        },
        onError(error) {
          dispatch(resolveAllPendingToolCalls({ chatId: threadId, status: 'error', errorMessage: error.message }));
          resumeStreamHadError = true;
          // Queue decision to localStorage for replay when agent recovers
          let decisionQueued = false;
          try {
            localStorage.setItem(
              `pending-decision:${threadId}`,
              JSON.stringify({ decisions, threadId, timestamp: Date.now() }),
            );
            decisionQueued = true;
          } catch { /* localStorage full or unavailable */ }
          dispatch(
            updateStreamingState({
              chatId: threadId,
              state: {
                error: decisionQueued
                  ? 'Decision queued. Will retry when agent recovers.'
                  : error.message,
                isLoading: false,
                isConnected: false,
                pendingInterrupt: decisionQueued ? null : savedInterrupt,
              },
            }),
          );
        },
        onStatusChange(status) {
          const partial = nextStreamingPartialForStatus(status);
          if (partial) dispatch(updateStreamingState({ chatId: threadId, state: partial }));
        },
        onDone() {
          if (!resumeStreamHadInterrupt) {
            dispatch(resolveAllPendingToolCalls({ chatId: threadId }));
          }
        },
        onMcpStatus(evt) {
          setMcpEvents((prev) => [...prev, evt]);
        },
        onMetadata(data) {
          setTraceId(data.trace_id);
        },
      };

      await manager.stream(resumeRequest, callbacks);
      if (!resumeStreamHadError) {
        try { localStorage.removeItem(`pending-decision:${threadId}`); } catch { /* ignore */ }
      }
    },
    [dispatch, threadId],
  );

  const resumeInterrupt = useCallback(
    async (response: string) => {
      const manager = managerRef.current;
      if (!manager || !threadId) return;

      dispatch(
        updateStreamingState({
          chatId: threadId,
          state: { pendingInterrupt: null, isLoading: true, error: null },
        }),
      );

      const token = typeof window.USER_DATA.accessToken === 'string' ? window.USER_DATA.accessToken : undefined;
      const userId =
        typeof window.USER_DATA.preferred_username === 'string'
          ? window.USER_DATA.preferred_username
          : '';
      const apiUrl = typeof window.APP_DATA?.apiUrl === 'string' ? window.APP_DATA.apiUrl : '';

      const streamRequest = {
        message: response,
        threadId,
        userId,
        apiUrl,
        token,
        resume: true,
      };

      let resumeStreamHadInterrupt = false;

      await new Promise<void>((resolve) => {
        const callbacks: StreamCallback = {
          onToken(content) {
            lastTokenTimeRef.current = Date.now();
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
          onDraftDiscard() {
            if (isStreamingTokensRef.current) {
              dispatch(removeLastMessageFromChat({ chatId: threadId }));
              isStreamingTokensRef.current = false;
            }
          },
          onMessage(m) {
            isStreamingTokensRef.current = false;
            if (m.type === 'human') return;

            if (m.type === 'tool') {
              dispatch(
                mergeToolResult({
                  chatId: threadId,
                  toolCallId: m.tool_call_id,
                  content: m.content,
                  status: (m as Record<string, unknown>).status as string | undefined,
                  mcpApp: (m as { mcpApp?: Record<string, unknown> }).mcpApp,
                  artifact: (m as { artifact?: unknown }).artifact,
                }),
              );
              return;
            }

            dispatch(appendMessageToChat({ chatId: threadId, message: m }));
          },
          onInterrupt(interrupt) {
            resumeStreamHadInterrupt = true;
            dispatch(
              updateStreamingState({
                chatId: threadId,
                state: { pendingInterrupt: enrichInterrupt(interrupt) },
              }),
            );
          },
          onError(error) {
            dispatch(resolveAllPendingToolCalls({ chatId: threadId, status: 'error', errorMessage: error.message }));
            dispatch(
              updateStreamingState({
                chatId: threadId,
                state: { error: error.message, isLoading: false, isConnected: false },
              }),
            );
          },
          onStatusChange(status) {
            const partial = nextStreamingPartialForStatus(status);
            if (partial) {
              dispatch(updateStreamingState({ chatId: threadId, state: partial }));
            }
          },
          onDone() {
            if (!resumeStreamHadInterrupt) {
              dispatch(resolveAllPendingToolCalls({ chatId: threadId }));
            }
            resolve();
          },
        };
        void manager.stream(streamRequest, callbacks);
      });
    },
    [dispatch, threadId],
  );

  // Auto-replay queued HITL decisions when an interrupt appears after recovery
  const resumeWithDecisionsRef = useRef(resumeWithDecisions);
  resumeWithDecisionsRef.current = resumeWithDecisions;
  useEffect(() => {
    if (!streamingState.pendingInterrupt || !threadId) return;
    const decisions = _tryReplayQueuedDecision(threadId);
    if (!decisions) return;
    // Defer to avoid dispatching during render
    const id = setTimeout(() => resumeWithDecisionsRef.current(decisions), 0);
    return () => clearTimeout(id);
  }, [streamingState.pendingInterrupt, threadId]);

  const stop = useCallback(() => {
    userCancelledRef.current = true;
    managerRef.current?.cancel();
    dispatch(resolveAllPendingToolCalls({ chatId: threadId, status: 'cancelled' }));
    clearReconnectTimers();
    if (recoveryIntervalRef.current) {
      clearInterval(recoveryIntervalRef.current);
      recoveryIntervalRef.current = null;
    }
    if (recoveryDeadlineRef.current) {
      clearTimeout(recoveryDeadlineRef.current);
      recoveryDeadlineRef.current = null;
    }
    dispatch(
      updateStreamingState({
        chatId: threadId,
        state: {
          isLoading: false,
          isConnected: false,
          isThinking: false,
          isReconnecting: false,
          reconnectAttempt: 0,
          streamDroppedMidResponse: false,
        },
      }),
    );
  }, [dispatch, threadId, clearReconnectTimers]);

  return {
    messages,
    streamEvents,
    isLoading: streamingState.isLoading,
    pendingInterrupt: streamingState.pendingInterrupt,
    taskSteps: streamingState.taskSteps,
    submit,
    resumeWithDecisions,
    checkAndAutoApprove,
    resumeInterrupt,
    stop,
    setMessages,
    retryCount,
    isStreamStale,
    wasInterrupted,
    mcpEvents,
    traceId,
    streamStartTime: lastStreamTiming?.streamStartTime ?? null,
    firstTokenTime: lastStreamTiming?.firstTokenTime ?? null,
    streamEndTime: lastStreamTiming?.streamEndTime ?? null,
    timeToFirstToken:
      lastStreamTiming?.timeToFirstTokenMs != null
        ? lastStreamTiming.timeToFirstTokenMs
        : null,
    totalDuration:
      lastStreamTiming?.totalDurationMs != null ? lastStreamTiming.totalDurationMs : null,
  };
}
