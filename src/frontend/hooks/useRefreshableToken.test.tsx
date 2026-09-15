import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../services/authenticated-fetch', () => ({
  notifySessionExpired: vi.fn(),
}));

import { useRefreshableToken } from './useRefreshableToken';
import { notifySessionExpired } from '../services/authenticated-fetch';

describe('useRefreshableToken', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.restoreAllMocks();
    (window as any).USER_DATA = {
      accessToken: 'test-token-123',
      expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the initial token from USER_DATA', () => {
    const { result } = renderHook(() => useRefreshableToken());
    expect(result.current.token).toBe('test-token-123');
  });

  it('returns token status with time left', () => {
    const { result } = renderHook(() => useRefreshableToken());
    expect(result.current.tokenStatus.text).toContain('left');
  });

  it('shows expired status when token is already expired', () => {
    (window as any).USER_DATA.expiresAt = new Date(Date.now() - 1000).toISOString();
    const { result } = renderHook(() => useRefreshableToken());
    expect(result.current.tokenStatus.text).toBe('Token expired');
    expect(result.current.tokenStatus.color).toBe('text-red-400');
  });

  it('handles invalid date for expiresAt', () => {
    (window as any).USER_DATA.expiresAt = 'invalid-date';
    const { result } = renderHook(() => useRefreshableToken());
    // Invalid date produces NaN for getTime(), so diffSeconds is NaN
    // The function falls through to the last else branch or returns "No token"
    expect(result.current.tokenStatus).toBeDefined();
    expect(result.current.tokenStatus.color).toBeDefined();
  });

  it('refreshes token when approaching expiry', async () => {
    (window as any).USER_DATA.expiresAt = new Date(Date.now() + 25_000).toISOString();

    const newExpiry = new Date(Date.now() + 3600_000).toISOString();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({
        message: 'RefreshedToken',
        token: { access_token: 'new-token', expires_at: newExpiry },
      }),
    }));

    const { result } = renderHook(() => useRefreshableToken());

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith('/auth/refresh?forceRefresh=true');
  });

  it('calls notifySessionExpired on 401 refresh response', async () => {
    (window as any).USER_DATA.expiresAt = new Date(Date.now() + 25_000).toISOString();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 401,
    }));

    renderHook(() => useRefreshableToken());

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });

    expect(notifySessionExpired).toHaveBeenCalled();
  });

  it('cleans up interval on unmount', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useRefreshableToken());
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('shows seconds-level status for tokens expiring soon', () => {
    (window as any).USER_DATA.expiresAt = new Date(Date.now() + 45_000).toISOString();
    const { result } = renderHook(() => useRefreshableToken());
    expect(result.current.tokenStatus.text).toMatch(/\d+s left/);
    expect(result.current.tokenStatus.color).toBe('text-yellow-400');
  });

  it('shows minutes-level status for tokens with minutes left', () => {
    (window as any).USER_DATA.expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
    const { result } = renderHook(() => useRefreshableToken());
    expect(result.current.tokenStatus.text).toMatch(/\d+m left/);
  });

  it('shows red for tokens with <15 minutes left', () => {
    (window as any).USER_DATA.expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    const { result } = renderHook(() => useRefreshableToken());
    expect(result.current.tokenStatus.color).toBe('text-red-400');
  });

  it('shows hours-level status for tokens with hours left', () => {
    (window as any).USER_DATA.expiresAt = new Date(Date.now() + 3 * 3600_000).toISOString();
    const { result } = renderHook(() => useRefreshableToken());
    expect(result.current.tokenStatus.text).toMatch(/\d+h left/);
    expect(result.current.tokenStatus.color).toBe('text-green-400');
  });

  it('shows yellow for tokens with <2 hours left', () => {
    (window as any).USER_DATA.expiresAt = new Date(Date.now() + 1.5 * 3600_000).toISOString();
    const { result } = renderHook(() => useRefreshableToken());
    expect(result.current.tokenStatus.color).toBe('text-yellow-400');
  });

  it('shows days-level status for tokens with days left', () => {
    (window as any).USER_DATA.expiresAt = new Date(Date.now() + 48 * 3600_000).toISOString();
    const { result } = renderHook(() => useRefreshableToken());
    expect(result.current.tokenStatus.text).toMatch(/\d+d left/);
    expect(result.current.tokenStatus.color).toBe('text-green-400');
  });
});
