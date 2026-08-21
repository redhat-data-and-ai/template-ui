import { useCallback, useEffect, useRef, useState } from 'react';
import { buildAppPath } from '../lib/app-paths';
import { useEvalStatus, type EvalState } from './useEvalStatus';
import { useEvalHistory } from './useEvalHistory';
import { useEvalTrends } from './useEvalTrends';
import type {
  ActionState,
  EvalRow,
  EvalHistoryResponse,
  EvalTrendsResponse,
} from '../components/settings/eval/eval-types';

export interface McpAuthRequired {
  name: string;
  connect_url: string;
}

export interface EvalDashboardState {
  evalState: EvalState;
  isRunning: boolean;
  result: EvalRow | null;
  history: EvalHistoryResponse | null;
  trends: EvalTrendsResponse | null;
  triggerState: ActionState;
  triggeredAt: number | null;
  hasTriggered: boolean;
  trigger: (force: boolean) => Promise<void>;
  authRequired: McpAuthRequired[];
  clearAuthRequired: () => void;
}

export function useEvalDashboard(): EvalDashboardState {
  const { state: evalState, refresh: refreshStatus } = useEvalStatus();
  const { data: history, refetch: refetchHistory } = useEvalHistory();
  const { data: trends, refetch: refetchTrends } = useEvalTrends();

  const mountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
    };
  }, []);

  const [result, setResult] = useState<EvalRow | null>(null);
  const [triggerState, setTriggerState] = useState<ActionState>({
    status: 'idle',
    message: '',
  });
  const [authRequired, setAuthRequired] = useState<McpAuthRequired[]>([]);
  const [triggeredAt, setTriggeredAt] = useState<number | null>(null);
  const [hasTriggered, setHasTriggered] = useState(
    () => sessionStorage.getItem('evalHasTriggered') === '1'
  );

  const prevStatusRef = useRef(evalState.status);
  // Keep refreshStatus stable in a ref so trigger callback can use it without re-creating
  const refreshStatusRef = useRef(refreshStatus);
  refreshStatusRef.current = refreshStatus;
  const resultRef = useRef(result);
  resultRef.current = result;
  const evalStatusRef = useRef(evalState.status);
  evalStatusRef.current = evalState.status;

  const isRunning = evalState.status === 'in_progress';

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch(
        buildAppPath('/api/proxy/agent/evals/results'),
        { credentials: 'same-origin' },
      );
      if (!res.ok) return;
      const data = (await res.json()) as EvalRow;
      if (mountedRef.current) setResult(data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const wasRunning =
      prevStatusRef.current === 'in_progress' ||
      prevStatusRef.current === 'not_started' ||
      prevStatusRef.current === 'unknown' ||
      prevStatusRef.current === 'error';
    const isNowComplete = evalState.status === 'completed';
    const isNowDone =
      evalState.status === 'completed' ||
      evalState.status === 'failed' ||
      evalState.status === 'error' ||
      evalState.status === 'no_dataset';

    if (wasRunning && isNowComplete) {
      void fetchResults();
      void refetchHistory();
      void refetchTrends();
    }

    // Clear the "queued / running" trigger message once the eval reaches any
    // terminal or definitive state — including the fast-fail path where status
    // jumps from the initial 'unknown' directly to 'error' before the first poll.
    if (wasRunning && isNowDone) {
      setTriggerState({ status: 'idle', message: '' });
      setTriggeredAt(null);
    }

    prevStatusRef.current = evalState.status;
  }, [evalState.status, fetchResults, refetchHistory, refetchTrends]);

  // Listen for OAuth popup completion — remove the connected server from the
  // auth-required list so the user can click Evaluate without re-authenticating.
  useEffect(() => {
    if (authRequired.length === 0) return undefined;
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const msg = event.data as { type?: string; mcp_name?: string } | null;
      if (msg?.type === 'mcp_oauth_done' && msg.mcp_name) {
        setAuthRequired((prev) => prev.filter((s) => s.name !== msg.mcp_name));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [authRequired.length]);

  const trigger = useCallback(
    async (force: boolean) => {
      const path = force
        ? '/api/proxy/agent/evals/force-trigger'
        : '/api/proxy/agent/evals/trigger';

      setTriggerState({ status: 'loading', message: '' });
      setTriggeredAt(Date.now());
      setHasTriggered(true);
      sessionStorage.setItem('evalHasTriggered', '1');
      try {
        const res = await fetch(buildAppPath(path), {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        });
        const data = (await res.json()) as Record<string, unknown>;
        if (res.status === 403) {
          const authReq = (data.auth_required ?? (data.detail as Record<string, unknown>)?.auth_required) as Array<{ name: string; connect_url: string }> | undefined;
          if (authReq?.length) {
            setAuthRequired(authReq);
            setTriggerState({ status: 'idle', message: '' });
            return;
          }
        }
        // Non-403 response — clear any stale auth prompt
        if (mountedRef.current) setAuthRequired([]);
        if (!res.ok) {
          const errFriendly: Record<number, string> = {
            429: 'Too many requests — wait a moment and try again.',
            503: 'Eval service unavailable — try again shortly.',
            502: 'Could not reach the eval runner — check your deployment.',
          };
          if (mountedRef.current) setTriggerState({
            status: 'error',
            message: errFriendly[res.status] ?? `Trigger failed (${res.status}) — check the agent logs.`,
          });
          return;
        }

        if ((data as { cached?: boolean }).cached) {
          if (mountedRef.current) setTriggerState({
            status: 'success',
            message: 'Already complete — showing latest result.',
          });
          await fetchResults();
          void refetchHistory();
          void refetchTrends();
          return;
        }

        if (
          data.eval_status === 'in_progress' &&
          (data as { message?: string }).message
        ) {
          if (mountedRef.current) setTriggerState({
            status: 'success',
            message: 'Eval already running — check back shortly.',
          });
          return;
        }

        if (mountedRef.current) setTriggerState({
          status: 'success',
          message: 'Eval queued — running in background.',
        });
        // Immediately refresh status so UI switches to in_progress without
        // waiting for the next scheduled poll (which may be up to 60s away).
        refreshStatusRef.current();
        // If the eval runner fails instantly (e.g. EVAL_RUNNER_URL not set),
        // the status never changes from 'error' → 'error', so the effect won't
        // fire. Poll once after a short delay and clear the queued message if
        // the eval has already reached a terminal state.
        if (timeoutRef.current !== null) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          if (!mountedRef.current) return;
          const terminal = ['completed', 'failed', 'error', 'no_dataset'];
          if (terminal.includes(evalStatusRef.current)) {
            setTriggerState({ status: 'idle', message: '' });
            setTriggeredAt(null);
          }
        }, 2000);
      } catch {
        if (mountedRef.current) setTriggerState({ status: 'error', message: 'Network error — could not reach the eval service.' });
      }
    },
    [fetchResults, refetchHistory, refetchTrends],
  );

  return {
    evalState,
    isRunning,
    result,
    history,
    trends,
    triggerState,
    triggeredAt,
    hasTriggered,
    trigger,
    authRequired,
    clearAuthRequired: () => setAuthRequired([]),
  };
}
