import { describe, it, expect, vi, beforeEach } from 'vitest';
import { submitFeedback, getThreadFeedback, type FeedbackPayload } from './feedback-api';

vi.mock('../lib/app-paths', () => ({
  buildAgentApiUrl: (path: string) => `/api/proxy/agent${path}`,
}));

describe('feedback-api', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('submitFeedback', () => {
    it('sends POST with correct payload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      const payload: FeedbackPayload = {
        traceId: 'trace-1',
        name: 'thumbs',
        value: 1,
        comment: 'Great!',
        threadId: 'thread-1',
        messageId: 'msg-1',
        userId: 'user-1',
      };

      await submitFeedback(payload);

      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/agent/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          trace_id: 'trace-1',
          name: 'thumbs',
          value: 1,
          kwargs: { comment: 'Great!' },
          thread_id: 'thread-1',
          message_id: 'msg-1',
          user_id: 'user-1',
        }),
      });
    });

    it('uses "anonymous" when no userId provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      await submitFeedback({ traceId: 't', name: 'n', value: 0 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.user_id).toBe('anonymous');
    });

    it('omits comment from kwargs when not provided', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', mockFetch);

      await submitFeedback({ traceId: 't', name: 'n', value: 0 });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.kwargs).toEqual({});
    });

    it('throws on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      await expect(submitFeedback({ traceId: 't', name: 'n', value: 0 })).rejects.toThrow('Feedback failed: 500');
    });
  });

  describe('getThreadFeedback', () => {
    it('returns parsed feedback map on success', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          feedback: [
            { message_id: 'msg-1', feedback: 'up' },
            { message_id: 'msg-2', feedback: 'down' },
          ],
        }),
      }));

      const result = await getThreadFeedback('thread-1', 'user-1');
      expect(result).toEqual({ 'msg-1': 'up', 'msg-2': 'down' });
    });

    it('returns empty object on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const result = await getThreadFeedback('thread-1');
      expect(result).toEqual({});
    });

    it('returns empty object when feedback array is missing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      }));

      const result = await getThreadFeedback('thread-1');
      expect(result).toEqual({});
    });

    it('uses default userId "anonymous"', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ feedback: [] }),
      });
      vi.stubGlobal('fetch', mockFetch);

      await getThreadFeedback('thread-1');
      expect(mockFetch.mock.calls[0][0]).toContain('user_id=anonymous');
    });
  });
});
