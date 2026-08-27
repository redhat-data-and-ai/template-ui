import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useEvalStatus } from './useEvalStatus';

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe('useEvalStatus', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ eval_status: 'not_started', message: 'no eval runs yet' })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('does not hit /evals/status on mount', async () => {
    renderHook(() => useEvalStatus());
    await act(async () => {
      await Promise.resolve();
    });
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('hits /evals/status only after refresh (trigger)', async () => {
    const { result } = renderHook(() => useEvalStatus());

    await act(async () => {
      result.current.refresh();
    });

    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalled();
    });
    expect(
      vi.mocked(fetch).mock.calls.every((call) => String(call[0]).includes('/evals/status')),
    ).toBe(true);
  });

  it('polls while in_progress after refresh, then stops', async () => {
    vi.useFakeTimers();
    let status: string = 'in_progress';
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({
        eval_status: status,
        ...(status === 'completed' ? { eval_score: 1, pass: 1, fail: 0, error: 0 } : {}),
      })),
    );

    const { result } = renderHook(() => useEvalStatus());
    await act(async () => {
      result.current.refresh();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state.status).toBe('in_progress');

    status = 'completed';
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.state.status).toBe('completed');

    const afterComplete = vi.mocked(fetch).mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });
    expect(vi.mocked(fetch).mock.calls.length).toBe(afterComplete);
  });

  it('resumes /evals/status after remount when a run was already triggered', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => jsonResponse({ eval_status: 'in_progress' })),
    );

    const first = renderHook(() => useEvalStatus());
    await act(async () => {
      first.result.current.refresh();
    });
    await waitFor(() => {
      expect(first.result.current.state.status).toBe('in_progress');
    });
    first.unmount();

    vi.mocked(fetch).mockClear();

    const second = renderHook(() => useEvalStatus());
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalled();
      expect(second.result.current.state.status).toBe('in_progress');
    });
    expect(
      vi.mocked(fetch).mock.calls.every((call) => String(call[0]).includes('/evals/status')),
    ).toBe(true);
  });
});
