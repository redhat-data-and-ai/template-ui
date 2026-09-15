import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let mockRedisInstance: any = null;

vi.mock('ioredis', () => {
  return {
    Redis: vi.fn().mockImplementation(function (this: any) {
      mockRedisInstance = {
        on: vi.fn().mockReturnValue(this),
        connect: vi.fn().mockResolvedValue(undefined),
        disconnect: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        setex: vi.fn().mockResolvedValue('OK'),
        del: vi.fn().mockResolvedValue(1),
      };
      Object.assign(this, mockRedisInstance);
      return this;
    }),
  };
});

describe('redis', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockRedisInstance = null;
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns null when REDIS_HOST is not set', async () => {
    delete process.env.REDIS_HOST;
    const { getRedisClient } = await import('./redis');
    expect(getRedisClient()).toBeNull();
  });

  it('creates a Redis client when REDIS_HOST is set', async () => {
    process.env.REDIS_HOST = 'localhost';
    const { getRedisClient } = await import('./redis');
    const client = getRedisClient();
    expect(client).not.toBeNull();
  });

  it('connectRedis returns null when no host', async () => {
    delete process.env.REDIS_HOST;
    const { connectRedis } = await import('./redis');
    expect(await connectRedis()).toBeNull();
  });

  it('connectRedis connects successfully', async () => {
    process.env.REDIS_HOST = 'localhost';
    const { connectRedis } = await import('./redis');
    const client = await connectRedis();
    expect(client).not.toBeNull();
  });

  it('connectRedis returns null on connection failure', async () => {
    process.env.REDIS_HOST = 'localhost';
    const { getRedisClient, connectRedis } = await import('./redis');
    const client = getRedisClient();
    // Override the connect mock to reject
    (client as any).connect = vi.fn().mockRejectedValue(new Error('refused'));
    const result = await connectRedis();
    expect(result).toBeNull();
  });

  it('buildSessionStore returns undefined when not connected', async () => {
    process.env.REDIS_HOST = 'localhost';
    const { buildSessionStore } = await import('./redis');
    expect(buildSessionStore()).toBeUndefined();
  });

  it('buildSessionStore returns a store after connect', async () => {
    process.env.REDIS_HOST = 'localhost';
    const { connectRedis, buildSessionStore } = await import('./redis');
    await connectRedis();
    const store = buildSessionStore();
    expect(store).toBeDefined();
    expect(store!.get).toBeDefined();
    expect(store!.set).toBeDefined();
    expect(store!.destroy).toBeDefined();
  });

  it('session store get retrieves and parses JSON', async () => {
    process.env.REDIS_HOST = 'localhost';
    const { connectRedis, buildSessionStore, getRedisClient } = await import('./redis');
    await connectRedis();
    const store = buildSessionStore()!;

    const client = getRedisClient()!;
    (client as any).get = vi.fn().mockResolvedValue(JSON.stringify({ user: 'test' }));

    await new Promise<void>((resolve) => {
      store.get('session123', (err: any, result: any) => {
        expect(err).toBeNull();
        expect(result).toEqual({ user: 'test' });
        resolve();
      });
    });
  });

  it('session store set writes with TTL', async () => {
    process.env.REDIS_HOST = 'localhost';
    const { connectRedis, buildSessionStore, getRedisClient } = await import('./redis');
    await connectRedis();
    const store = buildSessionStore()!;

    const client = getRedisClient()!;
    const setexSpy = vi.fn().mockResolvedValue('OK');
    (client as any).setex = setexSpy;

    await new Promise<void>((resolve) => {
      store.set('s1', { data: 1 }, () => {
        expect(setexSpy).toHaveBeenCalledWith(
          'sess:s1',
          expect.any(Number),
          JSON.stringify({ data: 1 }),
        );
        resolve();
      });
    });
  });

  it('session store destroy deletes the key', async () => {
    process.env.REDIS_HOST = 'localhost';
    const { connectRedis, buildSessionStore, getRedisClient } = await import('./redis');
    await connectRedis();
    const store = buildSessionStore()!;

    const client = getRedisClient()!;
    const delSpy = vi.fn().mockResolvedValue(1);
    (client as any).del = delSpy;

    await new Promise<void>((resolve) => {
      store.destroy('s1', () => {
        expect(delSpy).toHaveBeenCalledWith('sess:s1');
        resolve();
      });
    });
  });
});
