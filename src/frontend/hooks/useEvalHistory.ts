import { useCallback, useEffect, useRef, useState } from 'react';
import { buildAppPath } from '../lib/app-paths';
import type { EvalHistoryResponse } from '../components/settings/eval/eval-types';

export function useEvalHistory(limit = 20) {
  const [data, setData] = useState<EvalHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        buildAppPath(`/api/proxy/agent/evals/history?limit=${limit}`),
        { credentials: 'same-origin', signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as EvalHistoryResponse;
      if (mounted.current) setData(json);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    mounted.current = true;
    void fetchHistory();
    return () => { mounted.current = false; };
  }, [fetchHistory]);

  return { data, loading, error, refetch: fetchHistory };
}
