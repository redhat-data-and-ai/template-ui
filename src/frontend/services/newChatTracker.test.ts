import { describe, it, expect } from 'vitest';
import {
  markChatAsClientCreated,
  isClientCreatedChat,
  unmarkChatAsClientCreated,
} from './newChatTracker';

describe('newChatTracker', () => {
  it('marks a chat as client-created', () => {
    markChatAsClientCreated('chat-1');
    expect(isClientCreatedChat('chat-1')).toBe(true);
  });

  it('returns false for unknown chat IDs', () => {
    expect(isClientCreatedChat('unknown-id')).toBe(false);
  });

  it('unmarks a chat', () => {
    markChatAsClientCreated('chat-2');
    expect(isClientCreatedChat('chat-2')).toBe(true);
    unmarkChatAsClientCreated('chat-2');
    expect(isClientCreatedChat('chat-2')).toBe(false);
  });

  it('handles unmark for non-existent ID', () => {
    expect(() => unmarkChatAsClientCreated('does-not-exist')).not.toThrow();
  });
});
