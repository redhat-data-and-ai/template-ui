import { store } from '../redux/store';
import { resetChatsState } from '../redux/slices/chats';
import { clearAllToasts } from '../redux/slices/toasts';
import { resetPersonalization } from '../redux/slices/personalization';
import { chatStorage } from './chatStorage';

const AUTH_STORAGE_KEYS = ['access_token', 'refresh_token', 'id_token'] as const;

function buildGatewayLoginUrl(): string {
  const redirectPath = `${globalThis.location.pathname}${globalThis.location.search}${globalThis.location.hash}` || '/';
  return `/auth/login?redirect=${encodeURIComponent(redirectPath)}`;
}

export async function logout() {
  try {
    await fetch('/auth/logout', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    // Still clear local session state if the network request fails.
  }

  chatStorage.clearChats();

  for (const key of AUTH_STORAGE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }

  store.dispatch(resetChatsState());
  store.dispatch(clearAllToasts());
  store.dispatch(resetPersonalization());

  globalThis.location.assign(buildGatewayLoginUrl());
}
