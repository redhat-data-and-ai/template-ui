import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { evalTriggerDoneMessage } from '../components/settings/eval/eval-utils';
import { useEvalDashboard } from './useEvalDashboard';

const CACHE_MESSAGE = evalTriggerDoneMessage({ cached: true });

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('useEvalDashboard — cache-hit message', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/evals/trigger')) {
          return jsonResponse({
            cached: true,
            eval_status: 'completed',
            eval_score: 1,
            pass: 2,
            fail: 0,
            error: 0,
          });
        }
        if (url.includes('/evals/status')) {
          return jsonResponse({
            eval_status: 'completed',
            eval_score: 1,
            pass: 2,
            fail: 0,
            error: 0,
          });
        }
        if (url.includes('/evals/history')) {
          return jsonResponse({ runs: [], total: 0 });
        }
        if (url.includes('/evals/trends')) {
          return jsonResponse({ metrics: {}, overall: [] });
        }
        if (url.includes('/evals/results')) {
          return jsonResponse({
            eval_status: 'completed',
            eval_score: 1,
            pass: 2,
            fail: 0,
          });
        }
        return jsonResponse({}, 404);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not poll /evals/status until Evaluate is clicked', async () => {
    renderHook(() => useEvalDashboard());

    await act(async () => {
      await Promise.resolve();
    });

    const statusCalls = vi.mocked(fetch).mock.calls.filter((call) =>
      String(call[0]).includes('/evals/status'),
    );
    expect(statusCalls).toHaveLength(0);
  });

  it('keeps the cache-hit message after trigger 200 under React Strict Mode', async () => {
    const { result } = renderHook(() => useEvalDashboard(), {
      reactStrictMode: true,
    });

    await act(async () => {
      await result.current.trigger(false);
    });

    await waitFor(() => {
      expect(result.current.triggerState.message).toBe(CACHE_MESSAGE);
      expect(result.current.triggerState.status).toBe('success');
      expect(result.current.isCached).toBe(true);
    });
  });
});

describe('useEvalDashboard — failed trigger', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not keep Evaluating after a 403 group-access denial', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/evals/trigger')) {
          return jsonResponse(
            { detail: 'Access denied: DEVELOPER_GROUP is not configured.' },
            403,
          );
        }
        if (url.includes('/evals/history')) {
          return jsonResponse({ runs: [], total: 0 });
        }
        if (url.includes('/evals/trends')) {
          return jsonResponse({ metrics: {}, overall: [] });
        }
        return jsonResponse({}, 404);
      }),
    );

    const { result } = renderHook(() => useEvalDashboard());

    await act(async () => {
      await result.current.trigger(false);
    });

    expect(result.current.triggerState.status).toBe('error');
    expect(result.current.triggerState.message).toBe(
      'Access denied: DEVELOPER_GROUP is not configured.',
    );
    expect(result.current.isRunning).toBe(false);
    expect(result.current.triggeredAt).toBeNull();
    expect(result.current.hasTriggered).toBe(false);
    expect(sessionStorage.getItem('evalHasTriggered')).toBeNull();
  });

  it('does not show Evaluating on remount when status poll is 403', async () => {
    sessionStorage.setItem('evalHasTriggered', '1');
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo) => {
        const url = String(input);
        if (url.includes('/evals/status')) {
          return jsonResponse(
            { detail: 'Access denied: DEVELOPER_GROUP is not configured.' },
            403,
          );
        }
        if (url.includes('/evals/history')) {
          return jsonResponse({ runs: [], total: 0 });
        }
        if (url.includes('/evals/trends')) {
          return jsonResponse({ metrics: {}, overall: [] });
        }
        return jsonResponse({}, 404);
      }),
    );

    const { result } = renderHook(() => useEvalDashboard());

    await waitFor(() => {
      expect(result.current.evalState.status).toBe('error');
    });

    expect(result.current.isRunning).toBe(false);
  });
});
