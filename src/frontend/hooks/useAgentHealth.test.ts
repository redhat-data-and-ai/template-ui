import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentHealth } from './useAgentHealth';

describe('useAgentHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts with unknown status', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy' }),
    }));

    const { result } = renderHook(() => useAgentHealth());
    expect(result.current.status).toBe('unknown');
  });

  it('sets healthy status on successful response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'healthy' }),
    }));

    const { result } = renderHook(() => useAgentHealth());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe('healthy');
    expect(result.current.lastChecked).toBeInstanceOf(Date);
  });

  it('sets unhealthy on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const { result } = renderHook(() => useAgentHealth());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe('unhealthy');
  });

  it('sets unknown on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    const { result } = renderHook(() => useAgentHealth());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe('unknown');
  });

  it('maps unreachable to unhealthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'unreachable' }),
    }));

    const { result } = renderHook(() => useAgentHealth());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe('unhealthy');
  });
  it('maps degraded to degraded, not unknown', async () => {
    // The agent returns this with HTTP 200 when a non-critical
    // dependency is down and it is still serving. It used to render
    // as "status unknown", which said nothing was known when the
    // agent had said exactly what was wrong.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'degraded' }),
    }));

    const { result } = renderHook(() => useAgentHealth());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe('degraded');
  });

  it('maps shutting_down to unhealthy', async () => {
    // The pod is going away; offline is the honest label rather than
    // a fourth colour for a state that lasts seconds.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'shutting_down' }),
    }));

    const { result } = renderHook(() => useAgentHealth());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe('unhealthy');
  });

  it('reserves unknown for a status nobody reported', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'something-new' }),
    }));

    const { result } = renderHook(() => useAgentHealth());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result.current.status).toBe('unknown');
  });
});
