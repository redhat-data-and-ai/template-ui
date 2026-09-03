import { useCallback, useEffect, useRef, useState } from 'react';
import { buildAppPath } from '../lib/app-paths';

export type EvalStatusValue =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'error'
  | 'no_dataset'
  | 'unknown';

export interface EvalState {
  status: EvalStatusValue;
  message: string;
  score: number | null;
  pass: number;
  fail: number;
  error: number;
  configHash: string;
  lastChecked: Date | null;
  createdAt: string | null;
}

const POLL_ACTIVE_MS = 10_000;

/** Set when the user triggers an eval so tab switches can resume polling. */
const EVAL_STATUS_POLL_KEY = 'evalHasTriggered';

/** Reads the sessionStorage flag that indicates whether eval polling should be active. */
function readPollingFlag(): boolean {
  try {
    return sessionStorage.getItem(EVAL_STATUS_POLL_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persists the eval-polling flag to sessionStorage so polling resumes after tab switches. */
function writePollingFlag(): void {
  try {
    sessionStorage.setItem(EVAL_STATUS_POLL_KEY, '1');
  } catch {
    // private mode / disabled storage
  }
}

const INITIAL: EvalState = {
  status: 'unknown',
  message: '',
  score: null,
  pass: 0,
  fail: 0,
  error: 0,
  configHash: '',
  lastChecked: null,
  createdAt: null,
};

export interface UseEvalStatusResult {
  state: EvalState;
  refresh: () => void;
}

/** Polls the eval status endpoint and returns the latest EvalState with a manual refresh callback. */
export function useEvalStatus(): UseEvalStatusResult {
  const [state, setState] = useState<EvalState>(INITIAL);
  const [polling, setPolling] = useState(readPollingFlag);
  const statusRef = useRef<EvalStatusValue>('unknown');
  const mounted = useRef(true);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(buildAppPath('/api/proxy/agent/evals/status'), {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) return;
      const data = (await res.json()) as Record<string, unknown>;
      if (mounted.current) {
        const newStatus = (data.eval_status as EvalStatusValue) ?? 'unknown';
        statusRef.current = newStatus;
        setState({
          status: newStatus,
          message: typeof data.message === 'string' ? data.message : '',
          score: typeof data.eval_score === 'number' ? data.eval_score : null,
          pass: typeof data.pass === 'number' ? data.pass : 0,
          fail: typeof data.fail === 'number' ? data.fail : 0,
          error: typeof data.error === 'number' ? data.error : 0,
          configHash: typeof data.config_hash === 'string' ? data.config_hash : '',
          lastChecked: new Date(),
          createdAt: typeof data.created_at === 'string' ? data.created_at : null,
        });
      }
    } catch {
      // network error — keep existing state
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  // Resume after tab switch: settings unmounts this panel, so restore from
  // sessionStorage instead of polling on every cold open.
  useEffect(() => {
    if (!polling) return;
    void fetchStatus();
  }, [polling, fetchStatus]);

  useEffect(() => {
    if (!polling) return;
    if (state.status !== 'in_progress') return;

    const id = window.setInterval(() => { void fetchStatus(); }, POLL_ACTIVE_MS);
    return () => window.clearInterval(id);
  }, [fetchStatus, polling, state.status]);

  const refresh = useCallback(() => {
    writePollingFlag();
    setPolling(true);
    void fetchStatus();
  }, [fetchStatus]);
  return { state, refresh };
}
