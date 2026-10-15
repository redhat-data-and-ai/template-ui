import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThreadSearch } from './useThreadSearch';
import * as api from '../services/search-api';

describe('useThreadSearch', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not search for a query shorter than three characters', () => {
    const spy = vi.spyOn(api, 'searchThreads');
    renderHook(() => useThreadSearch('ab'));
    vi.advanceTimersByTime(1000);
    expect(spy).not.toHaveBeenCalled();
  });

  it('debounces rather than searching on every keystroke', () => {
    const spy = vi.spyOn(api, 'searchThreads').mockResolvedValue({
      query: 'deploy',
      count: 0,
      results: [],
    });

    const { rerender } = renderHook(({ q }) => useThreadSearch(q), {
      initialProps: { q: 'dep' },
    });
    rerender({ q: 'depl' });
    rerender({ q: 'deploy' });

    vi.advanceTimersByTime(100);
    expect(spy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('deploy', expect.anything());
  });

  it('clears results when the query falls below the minimum', () => {
    vi.spyOn(api, 'searchThreads').mockResolvedValue({
      query: 'deploy',
      count: 1,
      results: [
        { thread_id: 't1', title: 'x', rank: 1, snippet: 's', updated_at: null },
      ],
    });

    const { result, rerender } = renderHook(({ q }) => useThreadSearch(q), {
      initialProps: { q: 'deploy' },
    });
    rerender({ q: 'd' });
    expect(result.current.hits).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('surfaces a failure instead of hanging on loading', async () => {
    vi.spyOn(api, 'searchThreads').mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useThreadSearch('deploy'));
    // waitFor polls on real timers and deadlocks against the fake ones;
    // advancing inside act() flushes both the timer and the rejection.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe('boom');
  });

  it('ignores an abort, which is the hook working rather than failing', async () => {
    vi.spyOn(api, 'searchThreads').mockRejectedValue(
      new DOMException('aborted', 'AbortError'),
    );

    const { result } = renderHook(() => useThreadSearch('deploy'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.error).toBeNull();
  });
});
