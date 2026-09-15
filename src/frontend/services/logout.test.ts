import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../redux/store', () => ({
  store: { dispatch: vi.fn() },
}));

vi.mock('../redux/slices/chats', () => ({
  resetChatsState: vi.fn(() => ({ type: 'chats/reset' })),
}));

vi.mock('../redux/slices/toasts', () => ({
  clearAllToasts: vi.fn(() => ({ type: 'toasts/clear' })),
}));

vi.mock('../redux/slices/personalization', () => ({
  resetPersonalization: vi.fn(() => ({ type: 'personalization/reset' })),
}));

vi.mock('./chatStorage', () => ({
  chatStorage: { clearChats: vi.fn() },
}));

import { logout } from './logout';
import { store } from '../redux/store';
import { chatStorage } from './chatStorage';

describe('logout', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let assignSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', mockFetch);

    assignSpy = vi.fn();
    Object.defineProperty(globalThis, 'location', {
      value: {
        assign: assignSpy,
        pathname: '/',
        search: '',
        hash: '',
      },
      writable: true,
      configurable: true,
    });
  });

  it('sends POST to /auth/logout', async () => {
    await logout();
    expect(mockFetch).toHaveBeenCalledWith('/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  });

  it('clears chat storage', async () => {
    await logout();
    expect(chatStorage.clearChats).toHaveBeenCalled();
  });

  it('dispatches Redux reset actions', async () => {
    await logout();
    expect(store.dispatch).toHaveBeenCalled();
    const calls = vi.mocked(store.dispatch).mock.calls.map((c) => (c[0] as any)?.type);
    expect(calls).toContain('chats/reset');
    expect(calls).toContain('toasts/clear');
    expect(calls).toContain('personalization/reset');
  });

  it('removes auth tokens from localStorage', async () => {
    localStorage.setItem('access_token', 'test');
    localStorage.setItem('refresh_token', 'test');
    localStorage.setItem('id_token', 'test');

    await logout();

    expect(localStorage.getItem('access_token')).toBeNull();
    expect(localStorage.getItem('refresh_token')).toBeNull();
    expect(localStorage.getItem('id_token')).toBeNull();
  });

  it('redirects to login with current path', async () => {
    await logout();
    expect(assignSpy).toHaveBeenCalledWith(expect.stringContaining('/auth/login'));
  });

  it('still clears state when fetch fails', async () => {
    mockFetch.mockRejectedValue(new Error('network'));
    await logout();
    expect(chatStorage.clearChats).toHaveBeenCalled();
    expect(store.dispatch).toHaveBeenCalled();
    expect(assignSpy).toHaveBeenCalled();
  });
});
