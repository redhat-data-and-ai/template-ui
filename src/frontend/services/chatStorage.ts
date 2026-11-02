import { ChatItem } from '../types/chat';
import { scopedStorageKey } from '../lib/app-paths';
import { stripClassification } from '../lib/text-utils';

function omitPrevProjectId(chats: ChatItem[]): ChatItem[] {
  return chats.map((chat) => {
    const copy = { ...chat } as ChatItem & { _prevProjectId?: unknown };
    delete copy._prevProjectId;
    return copy;
  });
}

/**
 * Strip large transient fields (artifacts, mcpApp, structured_content) from
 * messages before persisting to localStorage.  These are reloaded from the
 * Aegra thread state on next visit, so keeping them in the 5 MB localStorage
 * budget is wasteful and causes QuotaExceededError for chart-heavy threads.
 */
function stripHeavyFields(messages: any[]): any[] {
  return messages.map((msg) => {
    if (!msg || typeof msg !== 'object') return msg;
    const m = msg as Record<string, unknown>;

    if (Array.isArray(m.tool_calls)) {
      const lightCalls = (m.tool_calls as Record<string, unknown>[]).map((tc) => {
        const { artifact, mcpApp, ...rest } = tc;
        return rest;
      });
      return { ...m, tool_calls: lightCalls };
    }
    return m;
  });
}

class ChatStorageService {
  private readonly CHATS_STORAGE_KEY = scopedStorageKey('dataverse-ai-chats');
  private readonly MAX_CHATS = 50; // Limit to prevent localStorage bloat

  /**
   * Save chats to localStorage with error handling and size limits
   */
  saveChats(chats: ChatItem[]): boolean {
    try {
      const limitedChats = omitPrevProjectId(chats.slice(0, this.MAX_CHATS));
      localStorage.setItem(this.CHATS_STORAGE_KEY, JSON.stringify(limitedChats));
      return true;
    } catch (error) {
      console.error('Error saving chats to localStorage:', error);
      
      // If storage is full, try to reduce and save again
      try {
        const reducedChats = omitPrevProjectId(
          chats.slice(0, Math.floor(this.MAX_CHATS / 2)),
        );
        localStorage.setItem(this.CHATS_STORAGE_KEY, JSON.stringify(reducedChats));
        console.warn('localStorage was full, reduced chat history');
        return true;
      } catch (retryError) {
        console.error('Failed to save chats even after reducing history:', retryError);
        return false;
      }
    }
  }

  saveChatByThreadId(threadId: string, messages: any[]): boolean {
    const lightMessages = stripHeavyFields(messages);
    const chats = this.loadChats();
    const threadIdChat = chats.find((chat) => chat.id === threadId);
    if (threadIdChat) {
      threadIdChat.messages = lightMessages;
    } else {
      const rawContent = typeof messages[messages.length - 1]?.content === 'string'
        ? messages[messages.length - 1].content as string
        : '';
      const cleanTitle = stripClassification(rawContent) ?? 'Chat';
      chats.push({
        id: threadId,
        messages: lightMessages,
        title: cleanTitle,
        timestamp: new Date(),
        preview: cleanTitle,
        historicalActivities: {},
        feedback: {},
      });
    }
    return this.saveChats(chats);
  }

  /**
   * Load chats from localStorage with validation and error handling
   */
  loadChats(): ChatItem[] {
    try {
      const storedChats = localStorage.getItem(this.CHATS_STORAGE_KEY);
      if (!storedChats) return [];

      const parsedChats: ChatItem[] = JSON.parse(storedChats);
      
      // Validate and transform data
      return omitPrevProjectId(parsedChats)
        .filter(chat => chat.id && chat.title) // Filter invalid entries
        .map(chat => ({
          ...chat,
          timestamp: new Date(chat.timestamp), // Convert string back to Date
          messages: chat.messages || [],
          historicalActivities: chat.historicalActivities || {},
          feedback: chat.feedback ?? {},
        }));
    } catch (error) {
      console.error('Error loading chats from localStorage:', error);
      this.clearChats(); // Clear corrupted data
      return [];
    }
  }



  /**
   * Clear all chat data
   */
  clearChats(): void {
    try {
      localStorage.removeItem(this.CHATS_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing chat storage:', error);
    }
  }

  /**
   * Get storage usage info for debugging
   */
  getStorageInfo(): { used: number; total: number; chatsCount: number } {
    try {
      const chats = this.loadChats();
      const chatsData = localStorage.getItem(this.CHATS_STORAGE_KEY) || '';
      
      return {
        used: chatsData.length,
        total: 5242880, // 5MB typical localStorage limit
        chatsCount: chats.length
      };
    } catch (error) {
      console.error('Error getting storage info:', error);
      return { used: 0, total: 5242880, chatsCount: 0 };
    }
  }
}

// Export singleton instance
export const chatStorage = new ChatStorageService();
