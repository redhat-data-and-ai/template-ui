import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';

vi.mock('./tracing.js', () => ({
  startTracing: vi.fn(),
  shutdownTracing: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./server.js', () => ({
  setupServer: vi.fn().mockResolvedValue({
    listen: vi.fn(
      (_opts: unknown, cb: (err: null) => void) => cb(null),
    ),
  }),
  startConfigWatcher: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock('./utils/prompt-md.js', () => ({
  startPromptMdWatcher: vi.fn().mockReturnValue(vi.fn()),
}));

// Import the module once — this registers the process.on handlers under test.
beforeAll(async () => {
  await import('./index.js');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// uncaughtException handler
// ---------------------------------------------------------------------------

describe('server/index — uncaughtException handler', () => {
  it('warns and swallows ECONNREFUSED (error code)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const err = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5002'), {
      code: 'ECONNREFUSED',
    });
    process.emit('uncaughtException', err, 'uncaughtException');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Network error'),
      expect.stringContaining('ECONNREFUSED'),
    );
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('warns and swallows UND_ERR_* codes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const err = Object.assign(new Error('socket error'), { code: 'UND_ERR_SOCKET' });
    process.emit('uncaughtException', err, 'uncaughtException');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'), expect.any(String));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('warns and swallows "fetch failed" message errors', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    process.emit('uncaughtException', new Error('fetch failed'), 'uncaughtException');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'), expect.any(String));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('warns and swallows "socket hang up" message errors', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    process.emit('uncaughtException', new Error('socket hang up'), 'uncaughtException');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'), expect.any(String));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('logs structured error and exits(1) for non-network errors', async () => {
    const { shutdownTracing } = await import('./tracing.js');
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    process.emit(
      'uncaughtException',
      new Error('TypeError: cannot read property'),
      'uncaughtException',
    );

    // shutdownTracing().finally(() => exit(1)) is async — flush the microtask queue
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));
    expect(shutdownTracing).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '[Uncaught Exception]',
      expect.objectContaining({ message: expect.any(String) }),
    );
  });
});

// ---------------------------------------------------------------------------
// unhandledRejection handler
// ---------------------------------------------------------------------------

describe('server/index — unhandledRejection handler', () => {
  it('warns and swallows ECONNRESET rejection', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const err = Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' });
    process.emit('unhandledRejection', err, Promise.resolve());

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'), expect.any(String));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('warns and swallows ETIMEDOUT rejection', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    const err = Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' });
    process.emit('unhandledRejection', err, Promise.resolve());

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'), expect.any(String));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('warns and swallows "aborted" message rejections', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    process.emit('unhandledRejection', new Error('request aborted'), Promise.resolve());

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'), expect.any(String));
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it('logs structured error and exits(1) for non-network rejections', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    process.emit(
      'unhandledRejection',
      new Error('ReferenceError: foo is not defined'),
      Promise.resolve(),
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalledWith(
      '[Unhandled Rejection]',
      expect.objectContaining({ reason: expect.any(Error) }),
    );
  });

  it('handles non-Error rejection reasons', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    // A plain string that looks like a network message
    process.emit('unhandledRejection', 'fetch failed', Promise.resolve());

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Network error'), expect.any(String));
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
