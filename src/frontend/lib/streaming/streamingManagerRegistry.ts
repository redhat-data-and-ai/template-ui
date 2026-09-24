import { StreamingManager } from './StreamingManager';

const managers = new Map<string, StreamingManager>();

/**
 * StreamingManager instances must survive navigation between chats: the chat
 * view remounts on every thread switch, but the underlying fetch/SSE stream
 * should keep running in the background.
 */
export function getStreamingManager(chatId: string): StreamingManager {
  let manager = managers.get(chatId);
  if (!manager) {
    manager = new StreamingManager();
    managers.set(chatId, manager);
  }
  return manager;
}

export function releaseStreamingManager(chatId: string): void {
  managers.get(chatId)?.cancel();
  managers.delete(chatId);
}

export function releaseAllStreamingManagers(): void {
  for (const manager of managers.values()) {
    manager.cancel();
  }
  managers.clear();
}

// Global beforeunload: cancel all in-flight streams when the tab closes.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    for (const manager of managers.values()) {
      if (manager.getStatus() === 'connecting' || manager.getStatus() === 'streaming') {
        manager.cancel();
      }
    }
  });
}
