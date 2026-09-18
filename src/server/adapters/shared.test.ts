import { describe, it, expect } from 'vitest';
import { getCachedThreadState, setCachedThreadState, invalidateThreadStateCache } from './shared.js';

// ── Thread-state cache — per-user isolation ───────────────────────────────────
//
// Regression coverage for a CWE-862 (Missing Authorization) finding: the
// cache used to be keyed by threadId alone, so a session that resolved to a
// different user could still get a HIT containing another user's cached
// thread state for the same threadId. It must now be keyed by (userId, threadId).

describe('thread-state cache — per-user isolation', () => {
  it('returns a cached value for the same (userId, threadId) pair', () => {
    setCachedThreadState('alice', 'thread-1', '{"messages":["alice-data"]}');
    expect(getCachedThreadState('alice', 'thread-1')).toBe('{"messages":["alice-data"]}');
  });

  it('does NOT return another user\'s cached value for the same threadId', () => {
    setCachedThreadState('alice', 'thread-shared', '{"messages":["alice-secret"]}');

    // Bob requests the exact same threadId — must be a cache MISS, not
    // Alice's cached body, even though the underlying agent thread ID matches.
    expect(getCachedThreadState('bob', 'thread-shared')).toBeNull();
  });

  it('lets each user cache their own value for the same threadId independently', () => {
    setCachedThreadState('alice', 'thread-2', '{"owner":"alice"}');
    setCachedThreadState('bob', 'thread-2', '{"owner":"bob"}');

    expect(getCachedThreadState('alice', 'thread-2')).toBe('{"owner":"alice"}');
    expect(getCachedThreadState('bob', 'thread-2')).toBe('{"owner":"bob"}');
  });

  it('invalidates only the given user\'s cache entry for a threadId', () => {
    setCachedThreadState('alice', 'thread-3', '{"owner":"alice"}');
    setCachedThreadState('bob', 'thread-3', '{"owner":"bob"}');

    invalidateThreadStateCache('alice', 'thread-3');

    expect(getCachedThreadState('alice', 'thread-3')).toBeNull();
    expect(getCachedThreadState('bob', 'thread-3')).toBe('{"owner":"bob"}');
  });

  it('does not collide when the separator character appears inside userId or threadId', () => {
    // Regression test: (userId="a:b", threadId="c") and (userId="a", threadId="b:c")
    // used to join to the identical raw string "a:b:c" before components were
    // encoded independently. preferred_username/sub (userId) is IdP-controlled
    // and threadId is an unvalidated route param, so both can contain ':'.
    setCachedThreadState('a:b', 'c', '{"owner":"a:b"}');
    setCachedThreadState('a', 'b:c', '{"owner":"a"}');

    expect(getCachedThreadState('a:b', 'c')).toBe('{"owner":"a:b"}');
    expect(getCachedThreadState('a', 'b:c')).toBe('{"owner":"a"}');
  });
});
