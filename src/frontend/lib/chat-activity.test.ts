import { describe, it, expect } from 'vitest';
import { chatActivity, activityByChat } from './chat-activity';
import type { StreamingState } from '../redux/slices/chats';

const state = (over: Partial<StreamingState>): StreamingState =>
  ({ isLoading: false, isThinking: false, pendingInterrupt: null, ...over }) as StreamingState;

describe('chatActivity', () => {
  it('reports a streaming turn as running', () => {
    expect(chatActivity(state({ isLoading: true }))).toBe('running');
    expect(chatActivity(state({ isThinking: true }))).toBe('running');
  });

  it('puts a blocked turn ahead of a running one', () => {
    // A turn paused on an approval is still technically loading. What
    // the reader needs to know is that it is waiting on them.
    const blocked = state({ isLoading: true, pendingInterrupt: { value: 'x' } as never });
    expect(chatActivity(blocked)).toBe('needs-input');
  });

  it('treats a finished or unknown chat as idle', () => {
    expect(chatActivity(state({}))).toBe('idle');
    expect(chatActivity(undefined)).toBe('idle');
  });
});

describe('activityByChat', () => {
  it('lists only the chats that are doing something', () => {
    const result = activityByChat({
      a: state({ isLoading: true }),
      b: state({ pendingInterrupt: { value: 'x' } as never }),
      c: state({}),
    });

    expect(result).toEqual({ a: 'running', b: 'needs-input' });
  });

  it('survives an empty store', () => {
    expect(activityByChat({})).toEqual({});
    expect(activityByChat(undefined as never)).toEqual({});
  });
});
