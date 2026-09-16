import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  authenticatedFetch,
  parseRetryAfterSeconds,
  setAuthExpiredCallback,
  setRateLimitCallback,
  triggerRateLimit,
  notifySessionExpired,
} from './authenticated-fetch';

describe('authenticated-fetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setAuthExpiredCallback(null);
    setRateLimitCallback(null);
  });

  describe('parseRetryAfterSeconds', () => {
    it('returns 5 for null', () => {
      expect(parseRetryAfterSeconds(null)).toBe(5);
    });

    it('returns 5 for empty string', () => {
      expect(parseRetryAfterSeconds('')).toBe(5);
      expect(parseRetryAfterSeconds('  ')).toBe(5);
    });

    it('parses integer seconds', () => {
      expect(parseRetryAfterSeconds('10')).toBe(10);
      expect(parseRetryAfterSeconds('0')).toBe(0);
    });

    it('clamps negative values to 0', () => {
      expect(parseRetryAfterSeconds('-5')).toBe(0);
    });

    it('parses HTTP-date', () => {
      const futureDate = new Date(Date.now() + 60_000).toUTCString();
      const result = parseRetryAfterSeconds(futureDate);
      expect(result).toBeGreaterThan(50);
      expect(result).toBeLessThanOrEqual(61);
    });

    it('returns 0 for past HTTP-date', () => {
      const pastDate = new Date(Date.now() - 60_000).toUTCString();
      expect(parseRetryAfterSeconds(pastDate)).toBe(0);
    });

    it('returns 5 for unparseable string', () => {
      expect(parseRetryAfterSeconds('not-a-date-or-number')).toBe(5);
    });
  });

  describe('triggerRateLimit', () => {
    it('calls the registered rate limit callback', () => {
      const cb = vi.fn();
      setRateLimitCallback(cb);
      triggerRateLimit(10);
      expect(cb).toHaveBeenCalledWith(10);
    });

    it('does nothing when no callback is registered', () => {
      expect(() => triggerRateLimit(5)).not.toThrow();
    });
  });

  describe('notifySessionExpired', () => {
    it('calls the registered auth expired callback', () => {
      const cb = vi.fn();
      setAuthExpiredCallback(cb);
      notifySessionExpired();
      expect(cb).toHaveBeenCalled();
    });

    it('does nothing when no callback is registered', () => {
      expect(() => notifySessionExpired()).not.toThrow();
    });
  });

  describe('authenticatedFetch', () => {
    it('sets Content-Type to application/json by default', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);

      await authenticatedFetch('/api/test');

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.get('Content-Type')).toBe('application/json');
    });

    it('does not override existing Content-Type', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);

      await authenticatedFetch('/api/test', {
        headers: { 'Content-Type': 'text/plain' },
      });

      const headers = mockFetch.mock.calls[0][1].headers;
      expect(headers.get('Content-Type')).toBe('text/plain');
    });

    it('includes credentials', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);

      await authenticatedFetch('/api/test');
      expect(mockFetch.mock.calls[0][1].credentials).toBe('include');
    });

    it('calls onAuthExpired and throws on 401', async () => {
      const cb = vi.fn();
      setAuthExpiredCallback(cb);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));

      await expect(authenticatedFetch('/api/test')).rejects.toThrow('Session expired');
      expect(cb).toHaveBeenCalled();
    });

    it('calls onRateLimited and throws on 429', async () => {
      const cb = vi.fn();
      setRateLimitCallback(cb);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('', {
          status: 429,
          headers: { 'Retry-After': '30' },
        }),
      ));

      await expect(authenticatedFetch('/api/test')).rejects.toThrow('Rate limited');
      expect(cb).toHaveBeenCalledWith(30);
    });

    it('attaches retryAfterMs to the thrown error on 429', async () => {
      setRateLimitCallback(vi.fn());
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response('', {
          status: 429,
          headers: { 'Retry-After': '10' },
        }),
      ));

      try {
        await authenticatedFetch('/api/test');
        expect.fail('should throw');
      } catch (err: any) {
        expect(err.retryAfterMs).toBe(10000);
      }
    });

    it('returns response for successful requests', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));
      const resp = await authenticatedFetch('/api/test');
      expect(resp.status).toBe(200);
    });
  });
});
