import { useCallback, useEffect, useRef, useState } from 'react';
import { buildAppPath } from '../lib/app-paths';

export type AgentHealthStatus = 'healthy' | 'unhealthy' | 'unknown';

export interface AgentHealthState {
  status: AgentHealthStatus;
  lastChecked: Date | null;
}

const POLL_MS = 30_000;

interface HealthPayload {
  status?: string;
}

function mapStatus(raw: string | undefined): AgentHealthStatus {
  if (raw === 'healthy') return 'healthy';
  if (raw === 'unhealthy' || raw === 'unreachable') return 'unhealthy';
  return 'unknown';
}

export function useAgentHealth(): AgentHealthState {
  const [status, setStatus] = useState<AgentHealthStatus>('unknown');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const mounted = useRef(true);

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
    void check();
    const id = window.setInterval(() => {
      void check();
    }, POLL_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(id);
    };
  }, [check]);

  return { status, lastChecked };
}
