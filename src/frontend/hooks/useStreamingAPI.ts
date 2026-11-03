import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AIMessage, Message } from '@langchain/langgraph-sdk';

import type { StreamEvent } from '@/hooks/useDataStream';
import {
  type StreamingManager,
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
  setAuthRequiredOnLastMessage,
  updateStreamingState,
  type StreamingState,
  applySubagentProgress,
  closeSubagentSteps,
  clearSubagentProgress,
  selectSubagentProgress,
} from '@/redux/slices/chats';
import { chatStorage } from '@/services/chatStorage';
import { getThreadState, getThreadStateAndInterrupt,
  cancelRun,
  getInFlightRun,
} from '@/services/agent-rest';
import { buildAppPath } from '@/lib/app-paths';
import { addToast } from '@/redux/slices/toasts';
import { assignThreadToProjectThunk } from '@/redux/slices/projects';
import { isClientCreatedChat } from '@/services/newChatTracker';
import { selectAlwaysAllowedTools } from '@/redux/slices/userSettings';
import { isSubAgentToolCall, extractSubAgentName } from '@/types/deep-agent';
import type { HITLInterruptValue } from '@/types/deep-agent';
import { enrichInterrupt } from '@/lib/enrich-interrupt';
import { mergeMessageWithMcpModelContext } from '@/types/mcp-apps';



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
/** Max time to wait for a run picked up after a reload (ms).
 *
 * Longer than the recovery timeout: that one covers a stream that
 * broke and may never come back, this one covers a turn known to be
 * running, and a delegated turn can take minutes. */
export const REATTACH_POLL_TIMEOUT_MS = 900000;

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

/**
 * Classify HTTP status codes as non-recoverable (won't fix themselves by retrying).
 * 4xx errors are client errors, 500 is usually a config/code bug.
 * 502, 503, 504 are transient — keep polling.
 */
export function isNonRecoverableHttpStatus(status: number): boolean {
  if (status >= 400 && status < 500) return true;
  if (status === 500) return true;
  return false;
}

function isRecoverableStreamError(error: Error): boolean {
  if (error.name === 'AbortError') return false;

  // Check .status property first (set by StreamingManager)
  const status = (error as any).status;
  if (typeof status === 'number') {
    if (status === 429) return true;
    if (status >= 400 && status < 500) return false;
    if (status >= 500) return true;
  }

  // Fallback: check message for legacy format
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
  originalErrorMessage?: string,
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
        error: originalErrorMessage || 'Agent is unavailable. Please try again.',
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
    } catch (caughtErr) {
      if (caughtErr instanceof Error && (caughtErr as any).status && isNonRecoverableHttpStatus((caughtErr as any).status)) {
        // Non-recoverable server error (e.g. model config, 4xx, 500) — stop polling, show error
        if (deadlineRef.current) { clearTimeout(deadlineRef.current); deadlineRef.current = null; }
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = null;
        dispatch(updateStreamingState({
          chatId: threadId,
          state: {
            isLoading: false,
            isConnected: false,
            isReconnecting: false,
            reconnectAttempt: 0,
            error: caughtErr.message || originalErrorMessage || 'Agent is unavailable. Please try again.',
          },
        }));
        return;
      }
      // Transient error (502, 503, 504, network) — keep polling
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
  // Keyed by namespace, so two concurrent delegations stay apart and
  // each row updates in place rather than appending a log.
  // Keyed by namespace, so two concurrent delegations stay apart.
  // Each entry accumulates the tool calls as steps — see
  // lib/subagent-steps.
  // Progress lives in the store, not here.
  //
  // Held as component state it vanished the moment the reader opened
  // another chat, while the run — which outlives the tab that
  // started it — carried on calling a setter nobody was listening
  // to. Coming back showed a subagent box with no steps, stuck on
  // "Working". Messages were in the store and survived; this is now
  // in the same place, keyed by chat.
  const subagentProgress = useAppSelector((state) =>
    selectSubagentProgress(state as never, threadId),
  );

  const closeAllSubagentSteps = useCallback(() => {
    dispatch(closeSubagentSteps({ chatId: threadId, at: Date.now() }));
  }, [dispatch, threadId]);

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
  // The run currently executing on the agent, so Stop can name it.
  const liveRunIdRef = useRef<string | null>(null);
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
      // The previous run's id must not outlive it: Stop pressed before
      // this run's metadata arrives would otherwise cancel the run
      // that already finished.
      liveRunIdRef.current = null;
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
      dispatch(clearSubagentProgress({ chatId: threadId }));
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
            // However the turn ended, no delegation is still running.
            closeAllSubagentSteps();
            resolve(r);
          };

          lastStreamErrorRef.current = null;
          streamEndedWithInterruptRef.current = false;

          const callbacks: StreamCallback = {
            onToken(content, messageId) {
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
                  id: messageId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
              const recoverable = isRecoverableStreamError(error);
              if (recoverable && !recoveryIntervalRef.current && threadId) {
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
                        error: lastStreamErrorRef.current?.message || 'Agent is unavailable. Please try again.',
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
                  } catch (caughtErr) {
                    if (caughtErr instanceof Error && (caughtErr as any).status && isNonRecoverableHttpStatus((caughtErr as any).status)) {
                      if (recoveryIntervalRef.current) clearInterval(recoveryIntervalRef.current);
                      recoveryIntervalRef.current = null;
                      lastStreamErrorRef.current = caughtErr;
                      dispatch(updateStreamingState({
                        chatId: threadId,
                        state: {
                          isLoading: false, isConnected: false, isReconnecting: false, reconnectAttempt: 0,
                          error: caughtErr.message || 'Agent is unavailable. Please try again.',
                        },
                      }));
                      finish('failed');
                      return;
                    }
                    // Transient error (502, 503, 504, network) — keep polling
                  } finally {
                    polling = false;
                  }
                }, RECOVERY_POLL_INTERVAL_MS);
              }
              const agentUp = await isAgentReachable();
              const canRetry =
                agentUp && recoverable && attempt < MAX_RETRIES && !userCancelledRef.current;
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
              } else if (!agentUp && recoverable) {
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
                       error: lastStreamErrorRef.current?.message || 'Agent is unavailable. Please try again.',
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
                  } catch (caughtErr) {
                    if (caughtErr instanceof Error && (caughtErr as any).status && isNonRecoverableHttpStatus((caughtErr as any).status)) {
                      if (recoveryIntervalRef.current) clearInterval(recoveryIntervalRef.current);
                      recoveryIntervalRef.current = null;
                      lastStreamErrorRef.current = caughtErr;
                      dispatch(updateStreamingState({
                        chatId: threadId,
                        state: {
                          isLoading: false, isConnected: false, isReconnecting: false, reconnectAttempt: 0,
                          error: caughtErr.message || 'Agent is unavailable. Please try again.',
                        },
                      }));
                      return;
                    }
                    // Transient error (502, 503, 504, network) — keep polling
                  }
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
            onSubagentProgress(evt) {
              dispatch(applySubagentProgress({ chatId: threadId, event: evt, at: Date.now() }));
            },
            onAuthRequired(requests) {
              dispatch(
                setAuthRequiredOnLastMessage({ chatId: threadId, requests }),
              );
            },
            onMetadata(data) {
              setTraceId(data.trace_id);
              liveRunIdRef.current = data.run_id;
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
          }).catch((err: Error) => {
            lastStreamErrorRef.current = err;
            finish('failed');
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
          // Stream failed — for recoverable errors (network, 5xx), start recovery polling
          // in case the agent recovers (LeaseReaper). For non-recoverable errors
          // (config issues, 4xx), show the error immediately.
          if (err && !userCancelledRef.current && isRecoverableStreamError(err)) {
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
            }, recoveryIntervalRef, recoveryDeadlineRef, wasInterruptedRef, RECOVERY_POLL_INTERVAL_MS, RECOVERY_POLL_TIMEOUT_MS, lastStreamErrorRef.current?.message);
          } else if (err && !userCancelledRef.current) {
            // Non-recoverable error — show immediately, no polling
            dispatch(updateStreamingState({
              chatId: threadIdRef.current,
              state: {
                isLoading: false,
                isConnected: false,
                isReconnecting: false,
                reconnectAttempt: 0,
                error: err.message || 'Agent encountered an error.',
              },
            }));
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
                error: lastStreamErrorRef.current?.message || 'Agent is unavailable. Please try again.',
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
          } catch (caughtErr) {
            if (caughtErr instanceof Error && (caughtErr as any).status && isNonRecoverableHttpStatus((caughtErr as any).status)) {
              if (recoveryIntervalRef.current) clearInterval(recoveryIntervalRef.current);
              recoveryIntervalRef.current = null;
              lastStreamErrorRef.current = caughtErr;
              dispatch(updateStreamingState({
                chatId: threadId,
                state: {
                  isLoading: false, isConnected: false, isReconnecting: false, reconnectAttempt: 0,
                  error: caughtErr.message || 'Agent is unavailable. Please try again.',
                },
              }));
              return;
            }
            // Transient error (502, 503, 504, network) — keep polling
          }
          finally { polling = false; }
        }, RECOVERY_POLL_INTERVAL_MS);
      }
    },
    [dispatch, threadId, handleStreamActivityStatus, clearReconnectTimers, setMessages, setWasInterrupted, closeAllSubagentSteps],
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
        onToken(content, messageId) {
          lastTokenTimeRef.current = Date.now();
          if (!isStreamingTokensRef.current) {
            const message: AIMessage = {
              type: 'ai',
              content,
              tool_calls: [],
              id: messageId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
        onSubagentProgress(evt) {
          dispatch(applySubagentProgress({ chatId: threadId, event: evt, at: Date.now() }));
        },
        onAuthRequired(requests) {
          dispatch(setAuthRequiredOnLastMessage({ chatId: threadId, requests }));
        },
        onMetadata(data) {
          setTraceId(data.trace_id);
          liveRunIdRef.current = data.run_id;
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
          onToken(content, messageId) {
            lastTokenTimeRef.current = Date.now();
            if (!isStreamingTokensRef.current) {
              const message: AIMessage = {
                type: 'ai',
                content,
                tool_calls: [],
                id: messageId || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
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
          // Resuming is the same stream as any other, and a
          // delegation started before the pause keeps reporting
          // through it. Without this the four stream paths disagreed:
          // submit, resume-with-decisions and attach all forwarded
          // progress and this one dropped it, so connecting an
          // integration mid-turn froze every subagent box at the step
          // it had reached when the run paused.
          onSubagentProgress(evt) {
            dispatch(applySubagentProgress({ chatId: threadId, event: evt, at: Date.now() }));
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

  // Pick a turn back up after a reload.
  //
  // The run no longer belongs to the connection that started it, so
  // closing the tab, refreshing, or losing the network leaves it
  // going. The browser therefore cannot assume that what it cannot
  // see is not happening: on mount it asks the thread whether
  // anything is still running and, if so, shows it as working and
  // waits for the result rather than rendering a half-finished
  // answer as if it were final.
  //
  // Polled, not re-streamed. The agent does expose a reattach
  // endpoint with Last-Event-ID, which would restore live tokens;
  // this gets the answer in front of the reader without touching the
  // streaming translation, and is the smaller thing to get wrong.
  useEffect(() => {
    if (!threadId) return;
    let cancelled = false;
    let rejoining = false;

    const rejoin = async () => {
      if (cancelled || rejoining) return;
      // A stream this tab already owns needs no recovery — and
      // "owns" includes the moment before the first byte arrives.
      // Checking only for 'streaming' left a window during
      // 'connecting' where a focus event would tear down the turn
      // the user had just started.
      const status = managerRef.current?.getStatus();
      if (status === 'streaming' || status === 'connecting') return;

      rejoining = true;
      try {
        await rejoinOnce();
      } finally {
        rejoining = false;
      }
    };

    const rejoinOnce = async () => {
      const runId = await getInFlightRun(threadId);
      if (cancelled || !runId) return;
      // Re-checked after the await: the user may have submitted
      // while we were asking.
      const now = managerRef.current?.getStatus();
      if (now === 'streaming' || now === 'connecting') return;

      liveRunIdRef.current = runId;
      dispatch(
        updateStreamingState({
          chatId: threadId,
          state: { isLoading: true, isConnected: true, error: null },
        }),
      );

      // Attach to the live stream, so the turn carries on arriving
      // token by token instead of landing in one lump when it ends.
      const manager = getStreamingManager(threadId);
      managerRef.current = manager;

      // A reattached stream is still the same stream, so the same
      // reducers handle it. Token accumulation is tracked locally:
      // this browser joined partway through and owns none of the
      // state the original call set up.
      let streamingTokens = false;

      // Everything already on screen, by id.
      //
      // Attaching without a Last-Event-ID replays the run from its
      // first event, so a tab that watched half the turn and then
      // lost its connection would see that half a second time. The
      // agent supports resuming from an event id; until the BFF
      // carries ids through the translation, ignoring ids we are
      // already showing is what keeps the answer from doubling.
      //
      // How much of each message this tab has already rendered, by
      // id. A Set of ids was not enough: dropping every replayed
      // token for a known id also dropped the part of the answer
      // that arrived *after* the connection was lost, so a reader who
      // watched half a reply and came back kept the half. Counting
      // characters lets the replay run past what is on screen and
      // emit only the remainder.
      const seenChars = new Map<string, number>();
      for (const m of messagesRef.current ?? []) {
        const id = (m as { id?: string }).id;
        if (!id) continue;
        const c = (m as { content?: unknown }).content;
        seenChars.set(id, typeof c === 'string' ? c.length : 0);
      }
      const preExisting = new Set(seenChars.keys());
      /** Characters of a replayed message consumed so far. */
      const replayed = new Map<string, number>();
      // Only the message still being written can gain a tail, and
      // `updateLastMessageInChat` can only append to the last one.
      // Anything earlier is complete, so replay of it is just replay.
      const lastId = (() => {
        const all = messagesRef.current ?? [];
        return (all[all.length - 1] as { id?: string } | undefined)?.id;
      })();
      // Frozen on purpose: ids created *during* this attach must not
      // land in it, or the first token of a new message would make
      // every token after it look like replay.
      const appendedHere = new Set<string>();

      // `attach` reports failure through `onError` and returns
      // normally, so the `catch` below never ran: a 404 or a dropped
      // connection left the chat `isLoading: true, isConnected: true`
      // with no error and no poller — stuck, silently. Record it here
      // and check after.
      let attachFailed = false;

      const attachCallbacks: StreamCallback = {
        onToken(content, messageId) {
          if (messageId && preExisting.has(messageId)) {
            // Replay of something already on screen. Skip while the
            // replay is still behind what was rendered; once it
            // passes, append the tail only.
            if (messageId !== lastId) return;
            const already = seenChars.get(messageId) ?? 0;
            const before = replayed.get(messageId) ?? 0;
            const after = before + content.length;
            replayed.set(messageId, after);
            if (after <= already) return;
            const tail = content.slice(Math.max(0, already - before));
            if (!tail) return;
            dispatch(updateLastMessageInChat({ chatId: threadId, content: tail }));
            return;
          }
          if (!streamingTokens) {
            streamingTokens = true;
            dispatch(
              appendMessageToChat({
                chatId: threadId,
                message: {
                  type: 'ai',
                  content,
                  tool_calls: [],
                  id: messageId || `attach-${Date.now()}`,
                } as AIMessage,
              }),
            );
            return;
          }
          dispatch(updateLastMessageInChat({ chatId: threadId, content }));
        },
        onDraftDiscard() {
          if (!streamingTokens) return;
          streamingTokens = false;
          dispatch(removeLastMessageFromChat({ chatId: threadId }));
        },
        onMessage(m) {
          streamingTokens = false;
          if (m.type === 'human') return;

          // A tool result is not a message in the transcript: it is
          // the answer to a call already sitting in an assistant
          // message, and it has to be merged onto that call.
          // Appending it instead left `tool_calls[].content` empty,
          // which is the only thing telling the subagent box the
          // delegation is over — so the box sat on "Working" after
          // the reply had arrived, for anyone who had refreshed or
          // switched tabs and come back.
          if (m.type === 'tool') {
            const toolMsg = m as unknown as {
              tool_call_id?: string;
              content?: unknown;
              status?: string;
              artifact?: unknown;
            };
            if (!toolMsg.tool_call_id) return;
            dispatch(
              mergeToolResult({
                chatId: threadId,
                toolCallId: toolMsg.tool_call_id,
                content: toolMsg.content,
                status: toolMsg.status,
                artifact: toolMsg.artifact,
              }),
            );
            dispatch(
              updateStreamingState({
                chatId: threadId,
                state: { activeSubAgent: null },
              }),
            );
            return;
          }

          const id = (m as { id?: string }).id;
          if (id && (preExisting.has(id) || appendedHere.has(id))) return;
          if (id) appendedHere.add(id);
          dispatch(appendMessageToChat({ chatId: threadId, message: m }));
        },
        onSubagentProgress(evt) {
          dispatch(applySubagentProgress({ chatId: threadId, event: evt, at: Date.now() }));
        },
        onAuthRequired(requests) {
          dispatch(setAuthRequiredOnLastMessage({ chatId: threadId, requests }));
        },
        onInterrupt(payload) {
          dispatch(
            updateStreamingState({
              chatId: threadId,
              // Enriched like every other path. Storing the raw
              // interrupt left a reattached `mcp_auth_required`
              // without its `payload`, so the banner had nothing to
              // render the Connect button from.
              state: { pendingInterrupt: enrichInterrupt(payload), isLoading: false },
            }),
          );
        },
        onMetadata(data) {
          setTraceId(data.trace_id);
          liveRunIdRef.current = data.run_id;
        },
        onError() {
          attachFailed = true;
        },
        onStatusChange() {},
        onDone() {
          liveRunIdRef.current = null;
          closeAllSubagentSteps();
          dispatch(
            updateStreamingState({
              chatId: threadId,
              state: { isLoading: false, error: null },
            }),
          );
        },
      };

      try {
        await manager.attach({ threadId, runId }, attachCallbacks);
        if (!attachFailed) return;
      } catch {
        // Fall through to polling: the run is known to be going, and
        // a slower way to see the result beats none.
      }
      if (cancelled) return;

      _startRecoveryPolling(
        threadId,
        dispatch,
        (msgs) => {
          if (msgs.length === 0) return;
          dispatch(updateChat({ id: threadId, updates: { messages: msgs } }));
          setMessages(msgs.map((m) => JSON.parse(JSON.stringify(m))));
          dispatch(
            updateStreamingState({
              chatId: threadId,
              state: { isLoading: false, error: null },
            }),
          );
        },
        recoveryIntervalRef,
        recoveryDeadlineRef,
        wasInterruptedRef,
        RECOVERY_POLL_INTERVAL_MS,
        REATTACH_POLL_TIMEOUT_MS,
      );
    };

    void rejoin();

    // Also whenever the tab comes back.
    //
    // Switching tabs does not remount, so a mount-only check never
    // ran again — and a browser is free to drop a long-lived
    // connection in a backgrounded tab. The run carried on happily
    // on the server while the tab that came back showed a stream
    // that had quietly stopped arriving. Returning to the tab is
    // exactly the moment to ask whether we are still attached.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void rejoin();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // Thread identity only: re-running this on every render would
    // restart the poller underneath itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  const stop = useCallback(() => {
    userCancelledRef.current = true;
    managerRef.current?.cancel();
    // Aborting the fetch only detaches this browser. The run is
    // deliberately independent of the connection now, so stopping it
    // has to be said out loud.
    //
    // The id is only known once metadata arrives. Stop pressed while
    // still connecting therefore had either a stale id from the last
    // finished run — cancelling nothing — or none at all, and the
    // run it meant to stop carried on server-side under
    // `on_disconnect: "continue"` until the next focus rejoined it.
    // Ask the agent which run is actually in flight in that case.
    const runId = liveRunIdRef.current;
    liveRunIdRef.current = null;
    if (runId) {
      void cancelRun(threadId, runId);
    } else {
      void getInFlightRun(threadId)
        .then((live) => (live ? cancelRun(threadId, live) : undefined))
        .catch(() => undefined);
    }
    dispatch(resolveAllPendingToolCalls({ chatId: threadId, status: 'cancelled' }));
    closeAllSubagentSteps();
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
  }, [dispatch, threadId, clearReconnectTimers, closeAllSubagentSteps]);

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
    subagentProgress,
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
