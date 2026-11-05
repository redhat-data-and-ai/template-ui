import { describe, expect, it } from 'vitest';
import { serverKeepsLocalMessages } from './reload-watch';

describe('serverKeepsLocalMessages', () => {
  it('accepts a longer server list that still contains every saved message', () => {
    const local = [{ id: 'human-1' }, { id: 'ai-1' }];
    const server = [{ id: 'human-1' }, { id: 'ai-1' }, { id: 'ai-2' }];
    expect(serverKeepsLocalMessages(local, server)).toBe(true);
  });

  it('rejects a longer server list that is missing the newest saved message', () => {
    const local = [{ id: 'human-1' }, { id: 'ai-1' }, { id: 'human-2' }];
    const server = [{ id: 'human-1' }, { id: 'ai-1' }, { id: 'ai-old' }, { id: 'ai-extra' }];
    expect(serverKeepsLocalMessages(local, server)).toBe(false);
  });

  it('rejects an empty server list', () => {
    expect(serverKeepsLocalMessages([{ id: 'human-1' }], [])).toBe(false);
  });
});
