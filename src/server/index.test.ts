import { describe, it, expect, vi } from 'vitest';

vi.mock('./tracing.js', () => ({
  startTracing: vi.fn(),
  shutdownTracing: vi.fn().mockResolvedValue(undefined),
}));

describe('server/index — isNetworkError utility', () => {
  it('identifies ECONNREFUSED as network error', () => {
    const err = new Error('connect ECONNREFUSED 127.0.0.1:5002') as NodeJS.ErrnoException;
    err.code = 'ECONNREFUSED';
    expect(isNetworkError(err)).toBe(true);
  });

  it('identifies UND_ERR codes as network error', () => {
    const err = new Error('socket error') as NodeJS.ErrnoException;
    err.code = 'UND_ERR_SOCKET';
    expect(isNetworkError(err)).toBe(true);
  });

  it('identifies ECONNRESET as network error', () => {
    const err = new Error('reset') as NodeJS.ErrnoException;
    err.code = 'ECONNRESET';
    expect(isNetworkError(err)).toBe(true);
  });

  it('identifies EPIPE as network error', () => {
    const err = new Error('broken pipe') as NodeJS.ErrnoException;
    err.code = 'EPIPE';
    expect(isNetworkError(err)).toBe(true);
  });

  it('identifies ETIMEDOUT as network error', () => {
    const err = new Error('timeout') as NodeJS.ErrnoException;
    err.code = 'ETIMEDOUT';
    expect(isNetworkError(err)).toBe(true);
  });

  it('identifies EAI_AGAIN as network error', () => {
    const err = new Error('DNS lookup') as NodeJS.ErrnoException;
    err.code = 'EAI_AGAIN';
    expect(isNetworkError(err)).toBe(true);
  });

  it('identifies fetch failed messages', () => {
    expect(isNetworkError(new Error('fetch failed'))).toBe(true);
  });

  it('identifies socket hang up messages', () => {
    expect(isNetworkError(new Error('socket hang up'))).toBe(true);
  });

  it('identifies ECONNREFUSED in message (no code)', () => {
    expect(isNetworkError(new Error('connect ECONNREFUSED'))).toBe(true);
  });

  it('identifies network keyword in message', () => {
    expect(isNetworkError(new Error('network error'))).toBe(true);
  });

  it('identifies terminated keyword', () => {
    expect(isNetworkError(new Error('connection terminated'))).toBe(true);
  });

  it('identifies aborted keyword', () => {
    expect(isNetworkError(new Error('request aborted'))).toBe(true);
  });

  it('identifies UND_ERR in message', () => {
    expect(isNetworkError(new Error('UND_ERR_CONNECT_TIMEOUT'))).toBe(true);
  });

  it('handles string error values', () => {
    expect(isNetworkError('ECONNREFUSED')).toBe(true);
    expect(isNetworkError('fetch failed')).toBe(true);
  });

  it('returns false for non-network errors', () => {
    expect(isNetworkError(new Error('TypeError: Cannot read property'))).toBe(false);
    expect(isNetworkError(new Error('ReferenceError'))).toBe(false);
  });

  it('returns false for errors with unrelated codes', () => {
    const err = new Error('some error') as NodeJS.ErrnoException;
    err.code = 'ERR_INVALID_ARG_TYPE';
    expect(isNetworkError(err)).toBe(false);
  });
});

function isNetworkError(err: unknown): boolean {
  if (err instanceof Error && 'code' in err && typeof (err as NodeJS.ErrnoException).code === 'string') {
    const code = (err as NodeJS.ErrnoException).code!;
    if (code.startsWith('UND_ERR') || code === 'ECONNREFUSED' || code === 'ECONNRESET' ||
        code === 'EPIPE' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') {
      return true;
    }
  }
  const msg = err instanceof Error ? (err.message || '') : String(err);
  return msg.includes('ECONNREFUSED') || msg.includes('fetch failed') ||
    msg.includes('socket hang up') || msg.includes('network') || msg.includes('terminated') ||
    msg.includes('aborted') || msg.includes('UND_ERR');
}
