import { ChatItem } from '../types/chat';

class ChatStorageService {
  private readonly CHATS_STORAGE_KEY = 'dataverse-ai-chats';
  private readonly MAX_CHATS = 50; // Limit to prevent localStorage bloat

  /**
   * Save chats to localStorage with error handling and size limits
   */
  saveChats(chats: ChatItem[]): boolean {
    try {
      const limitedChats = chats.slice(0, this.MAX_CHATS);
      localStorage.setItem(this.CHATS_STORAGE_KEY, JSON.stringify(limitedChats));
      return true;
    } catch (error) {
      console.error('Error saving chats to localStorage:', error);
      
      // If storage is full, try to reduce and save again
      try {
        const reducedChats = chats.slice(0, Math.floor(this.MAX_CHATS / 2));
        localStorage.setItem(this.CHATS_STORAGE_KEY, JSON.stringify(reducedChats));
        console.warn('localStorage was full, reduced chat history');
        return true;
      } catch (retryError) {
        console.error('Failed to save chats even after reducing history:', retryError);
        return false;
      }
    }
  }

  saveChatByThreadId(threadId: string, messages: any[], deepResearchEvents?: any[]): boolean {
    const chats = this.loadChats();
    const threadIdChat = chats.find((chat) => chat.id === threadId);
    if (threadIdChat) {
      threadIdChat.messages = messages;
      if (deepResearchEvents !== undefined) {
        threadIdChat.deepResearchEvents = deepResearchEvents;
      }
    } else {
      const lastContent = messages.at(-1)?.content;
      const textPreview = typeof lastContent === "string"
        ? lastContent
        : "New Chat";
      chats.push({
        id: threadId,
        messages: messages,
        title: textPreview.substring(0, 80) || "New Chat",
        timestamp: new Date(),
        preview: textPreview.substring(0, 60),
        historicalActivities: {},
        deepResearchEvents: deepResearchEvents || [],
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
      return parsedChats
        .filter(chat => chat.id && chat.title)
        .map(chat => ({
          ...chat,
          timestamp: new Date(chat.timestamp),
          messages: chat.messages || [],
          historicalActivities: chat.historicalActivities || {},
          deepResearchEvents: chat.deepResearchEvents || [],
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

}

// Export singleton instance
export const chatStorage = new ChatStorageService();
