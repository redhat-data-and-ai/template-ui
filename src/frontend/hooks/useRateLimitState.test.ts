import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRateLimitState } from './useRateLimitState';
import { setRateLimitCallback } from '@/services/authenticated-fetch';

vi.mock('@/services/authenticated-fetch', () => ({
  setRateLimitCallback: vi.fn(),
  triggerRateLimit: vi.fn(),
}));

describe('useRateLimitState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(setRateLimitCallback).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts with not rate limited', () => {
    const { result } = renderHook(() => useRateLimitState());
    expect(result.current.isRateLimited).toBe(false);
    expect(result.current.retryAfterSeconds).toBe(0);
    expect(result.current.resetTime).toBeNull();
  });

  it('registers a rate limit callback on mount', () => {
    renderHook(() => useRateLimitState());
    expect(setRateLimitCallback).toHaveBeenCalledWith(expect.any(Function));
  });

  it('clears the callback on unmount', () => {
    const { unmount } = renderHook(() => useRateLimitState());
    unmount();
    expect(setRateLimitCallback).toHaveBeenCalledWith(null);
  });

  it('sets rate limited state when callback is invoked', () => {
    const { result } = renderHook(() => useRateLimitState());

    const callback = vi.mocked(setRateLimitCallback).mock.calls[0][0] as (n: number) => void;

    act(() => {
      callback(10);
    });

    expect(result.current.isRateLimited).toBe(true);
    expect(result.current.retryAfterSeconds).toBe(10);
    expect(result.current.resetTime).toBeInstanceOf(Date);
  });

  it('counts down every second', () => {
    const { result } = renderHook(() => useRateLimitState());
    const callback = vi.mocked(setRateLimitCallback).mock.calls[0][0] as (n: number) => void;

    act(() => {
      callback(3);
    });

    expect(result.current.retryAfterSeconds).toBe(3);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.retryAfterSeconds).toBe(2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.retryAfterSeconds).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.isRateLimited).toBe(false);
    expect(result.current.retryAfterSeconds).toBe(0);
  });

  it('handles zero retryAfterSeconds', () => {
    const { result } = renderHook(() => useRateLimitState());
    const callback = vi.mocked(setRateLimitCallback).mock.calls[0][0] as (n: number) => void;

    act(() => {
      callback(0);
    });

    expect(result.current.isRateLimited).toBe(false);
    expect(result.current.retryAfterSeconds).toBe(0);
  });

  it('handles negative retryAfterSeconds', () => {
    const { result } = renderHook(() => useRateLimitState());
    const callback = vi.mocked(setRateLimitCallback).mock.calls[0][0] as (n: number) => void;

    act(() => {
      callback(-5);
    });

    expect(result.current.isRateLimited).toBe(false);
  });

  it('floors non-integer retryAfterSeconds', () => {
    const { result } = renderHook(() => useRateLimitState());
    const callback = vi.mocked(setRateLimitCallback).mock.calls[0][0] as (n: number) => void;

    act(() => {
      callback(5.7);
    });

    expect(result.current.retryAfterSeconds).toBe(5);
  });
});
