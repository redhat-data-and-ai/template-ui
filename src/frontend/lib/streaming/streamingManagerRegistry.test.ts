import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./StreamingManager', () => {
  return {
    StreamingManager: class MockStreamingManager {
      cancel = vi.fn();
      getStatus = vi.fn().mockReturnValue('idle');
    },
  };
});

import {
  getStreamingManager,
  releaseStreamingManager,
  releaseAllStreamingManagers,
} from './streamingManagerRegistry';

describe('streamingManagerRegistry', () => {
  beforeEach(() => {
    releaseAllStreamingManagers();
  });

  it('creates a new manager for a chat ID', () => {
    const manager = getStreamingManager('chat-1');
    expect(manager).toBeDefined();
    expect(manager.cancel).toBeDefined();
  });

  it('returns the same manager for the same chat ID', () => {
    const m1 = getStreamingManager('chat-1');
    const m2 = getStreamingManager('chat-1');
    expect(m1).toBe(m2);
  });

  it('returns different managers for different chat IDs', () => {
    const m1 = getStreamingManager('chat-1');
    const m2 = getStreamingManager('chat-2');
    expect(m1).not.toBe(m2);
  });

  it('releaseStreamingManager cancels and removes', () => {
    const manager = getStreamingManager('chat-1');
    releaseStreamingManager('chat-1');
    expect(manager.cancel).toHaveBeenCalled();

    const newManager = getStreamingManager('chat-1');
    expect(newManager).not.toBe(manager);
  });

  it('releaseAllStreamingManagers cancels all', () => {
    const m1 = getStreamingManager('chat-1');
    const m2 = getStreamingManager('chat-2');
    releaseAllStreamingManagers();
    expect(m1.cancel).toHaveBeenCalled();
    expect(m2.cancel).toHaveBeenCalled();
  });

  it('releaseStreamingManager handles unknown ID gracefully', () => {
    expect(() => releaseStreamingManager('nonexistent')).not.toThrow();
  });
});
