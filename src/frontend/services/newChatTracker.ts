/**
 * Module-level Set tracking chat IDs created client-side (via "New Chat").
 * These threads don't exist on the backend until the first message is sent,
 * so attempting to fetch their state would always 404.
 */
const clientCreatedIds = new Set<string>();

export function markChatAsClientCreated(chatId: string): void {
  clientCreatedIds.add(chatId);
}

export function isClientCreatedChat(chatId: string): boolean {
  return clientCreatedIds.has(chatId);
}

export function unmarkChatAsClientCreated(chatId: string): void {
  clientCreatedIds.delete(chatId);
}
