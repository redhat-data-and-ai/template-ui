import { useCallback, useEffect, useRef, useState } from 'react';
import { buildAppPath } from '../lib/app-paths';

export type AgentHealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

export interface AgentHealthState {
  status: AgentHealthStatus;
  lastChecked: Date | null;
}

const POLL_MS = 30_000;

interface HealthPayload {
  status?: string;
}

/**
 * The agent's own vocabulary, mapped to what the status line shows.
 *
 * `degraded` used to fall through to "unknown". It is the state that
 * most needs saying: the agent returns it with HTTP 200 when a
 * non-critical dependency — cache, config — is down and it is still
 * serving, so the pod stays in rotation and the only outward sign is
 * this line. Calling that "status unknown" told the reader nothing
 * was wrong *and* nothing was known, when in fact the agent had said
 * precisely what was wrong.
 *
 * `shutting_down` is a 503 and the pod is going away: offline is the
 * honest label, not a fourth colour for a state that lasts seconds.
 *
 * "unknown" now means only what it says — the question could not be
 * answered.
 */
function mapStatus(raw: string | undefined): AgentHealthStatus {
  if (raw === 'healthy') return 'healthy';
  if (raw === 'degraded') return 'degraded';
  if (raw === 'unhealthy' || raw === 'unreachable' || raw === 'shutting_down') {
    return 'unhealthy';
  }
  return 'unknown';
}

export function useAgentHealth(): AgentHealthState {
  const [status, setStatus] = useState<AgentHealthStatus>('unknown');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const mounted = useRef(true);
  const intervalRef = useRef<number | null>(null);

  const check = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(buildAppPath('/api/health/agent'), {
        credentials: 'same-origin',
        signal: controller.signal,
      });
      if (!res.ok) {
        if (mounted.current) {
          setStatus('unhealthy');
          setLastChecked(new Date());
        }
        return;
      }
      const data = (await res.json()) as HealthPayload;
      if (mounted.current) {
        setStatus(mapStatus(data.status));
        setLastChecked(new Date());
      }
    } catch {
      if (mounted.current) {
        setStatus('unknown');
        setLastChecked(new Date());
      }
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;

    const startPolling = () => {
      if (intervalRef.current === null) {
        void check();
        intervalRef.current = window.setInterval(() => void check(), POLL_MS);
      }
    };

    const stopPolling = () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
      }
    };

    if (!document.hidden) {
      startPolling();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mounted.current = false;
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [check]);

  return { status, lastChecked };
}
