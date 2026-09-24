import { useCallback, useEffect, useRef, useState } from 'react';
import { buildAppPath } from '../lib/app-paths';
import type { EvalHistoryResponse } from '../components/settings/eval/eval-types';

/** Fetches paginated eval run history from the agent API and returns it with loading/error state. */
export function useEvalHistory(limit = 20) {
  const [data, setData] = useState<EvalHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const versionRef = useRef(0);

  const fetchHistory = useCallback(async () => {
    const version = ++versionRef.current;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        buildAppPath(`/api/proxy/agent/evals/history?limit=${limit}`),
        { credentials: 'same-origin', signal: AbortSignal.timeout(10_000) },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as EvalHistoryResponse;
      if (mounted.current && version === versionRef.current) setData(json);
    } catch (e) {
      if (mounted.current && version === versionRef.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (mounted.current && version === versionRef.current) setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    mounted.current = true;
    void fetchHistory();
    return () => { mounted.current = false; };
  }, [fetchHistory]);

  return { data, loading, error, refetch: fetchHistory };
}
