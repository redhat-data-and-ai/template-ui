import { useCallback, useEffect, useRef, useState } from 'react';
import { buildAgentApiUrl } from '../lib/app-paths';

export interface UseDatasetPresenceResult {
  hasCases: boolean;
}

function caseCount(data: unknown): number {
  if (typeof data !== 'object' || data === null) return 0;
  const dataset = (data as { dataset?: unknown }).dataset;
  if (typeof dataset !== 'object' || dataset === null) return 0;
  const cases = (dataset as { cases?: unknown }).cases;
  return Array.isArray(cases) ? cases.length : 0;
}

export function useDatasetPresence(): UseDatasetPresenceResult {
  const [hasCases, setHasCases] = useState(false);
  const mounted = useRef(true);

  const fetchPresence = useCallback(async () => {
    try {
      const res = await fetch(buildAgentApiUrl('/evals/dataset'), {
        credentials: 'same-origin',
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) {
        if (mounted.current) setHasCases(false);
        return;
      }
      const data: unknown = await res.json();
      if (mounted.current) setHasCases(caseCount(data) > 0);
    } catch {
      // network error — keep existing state
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    void fetchPresence();

    const onFocus = () => { void fetchPresence(); };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void fetchPresence();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mounted.current = false;
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchPresence]);

  return { hasCases };
}
