import { describe, expect, it, vi } from 'vitest';
import { savedInterruptIfPaused, serverKeepsLocalMessages, waitUntilPaused } from './reload-watch';

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

describe('savedInterruptIfPaused', () => {
  const approval = { value: { action_requests: [{ name: 'execute_sql' }] }, resumable: true };

  it('keeps the approval when the thread is paused', () => {
    expect(savedInterruptIfPaused('interrupted', approval)).toBe(approval);
  });

  it('drops the approval while a tool is still running', () => {
    expect(savedInterruptIfPaused('busy', approval)).toBeNull();
    expect(savedInterruptIfPaused('idle', approval)).toBeNull();
    expect(savedInterruptIfPaused('error', approval)).toBeNull();
    expect(savedInterruptIfPaused(null, approval)).toBeNull();
  });

  it('drops an empty approval even when the thread is paused', () => {
    expect(savedInterruptIfPaused('interrupted', null)).toBeNull();
  });
});

describe('waitUntilPaused', () => {
  it('returns true when a later read says the thread is paused', async () => {
    vi.useFakeTimers();
    const readStatus = vi.fn()
      .mockResolvedValueOnce('busy')
      .mockResolvedValueOnce('busy')
      .mockResolvedValueOnce('interrupted');
    const pending = waitUntilPaused(readStatus);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe(true);
    expect(readStatus).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('returns false when the thread stays busy', async () => {
    vi.useFakeTimers();
    const readStatus = vi.fn(async () => 'busy');
    const pending = waitUntilPaused(readStatus);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe(false);
    expect(readStatus).toHaveBeenCalledTimes(30);
    vi.useRealTimers();
  });

  it('stops when the caller asks it to', async () => {
    vi.useFakeTimers();
    let stop = false;
    const readStatus = vi.fn(async () => {
      stop = true;
      return 'busy';
    });
    const pending = waitUntilPaused(readStatus, () => stop);
    await vi.runAllTimersAsync();
    await expect(pending).resolves.toBe(false);
    expect(readStatus).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
