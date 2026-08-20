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

export function useEvalStatus(): UseEvalStatusResult {
  const [state, setState] = useState<EvalState>(INITIAL);
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
    void fetchStatus();

    if (statusRef.current !== 'in_progress') {
      return () => { mounted.current = false; };
    }

    const id = window.setInterval(() => { void fetchStatus(); }, POLL_ACTIVE_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [fetchStatus, state.status]);

  return { state, refresh: () => { void fetchStatus(); } };
}
