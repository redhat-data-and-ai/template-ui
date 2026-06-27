import { Redis } from 'ioredis';

let redisClient: Redis | null = null;
let redisConnected = false;

export function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const host = process.env.REDIS_HOST;
  if (!host) return null;

  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;
  const tls = process.env.REDIS_TLS === 'true' ? {} : undefined;

  try {
    redisClient = new Redis({
      host,
      port,
      password,
      tls,
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times) {
        if (times > 20) return null;
        return Math.min(times * 500, 5000);
      },
      reconnectOnError(err) {
        return err.message.includes('READONLY') || err.message.includes('Connection is closed');
      },
      lazyConnect: true,
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connected');
    });

    return redisClient;
  } catch (err) {
    console.warn('[Redis] Failed to create client, using in-memory sessions:', err);
    return null;
  }
}

export async function connectRedis(): Promise<Redis | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    await client.connect();
    redisConnected = true;
    return client;
  } catch (err) {
    console.warn('[Redis] Failed to connect, falling back to in-memory sessions:', err);
    redisConnected = false;
    try {
      await client.disconnect();
    } catch {
      /* ignore cleanup errors */
    }
    redisClient = null;
    return null;
  }
}

interface RedisSessionStore {
  get(sessionId: string, callback: (err: any, result?: any) => void): void;
  set(sessionId: string, session: any, callback: (err?: any) => void): void;
  destroy(sessionId: string, callback: (err?: any) => void): void;
}

/**
 * Build a @fastify/session-compatible store backed by Redis.
 * Returns undefined if Redis is unavailable so the caller can
 * fall back to the default in-memory store.
 */
export function buildSessionStore(prefix = 'sess:'): RedisSessionStore | undefined {
  if (!redisConnected || !redisClient) return undefined;
  const client = redisClient;

  const ttl = 60 * 60 * 24 * 30; // 30 days (matches cookie maxAge)

  const safeCb = (cb: (...args: any[]) => void, ...args: any[]) => {
    try { cb(...args); } catch { /* reply already sent, ignore */ }
  };

  return {
    get(sid, cb) {
      client
        .get(`${prefix}${sid}`)
        .then((raw) => safeCb(cb, null, raw ? JSON.parse(raw) : null))
        .catch(() => safeCb(cb, null, null));
    },
    set(sid, session, cb) {
      client
        .setex(`${prefix}${sid}`, ttl, JSON.stringify(session))
        .then(() => safeCb(cb))
        .catch(() => safeCb(cb));
    },
    destroy(sid, cb) {
      client
        .del(`${prefix}${sid}`)
        .then(() => safeCb(cb))
        .catch(() => safeCb(cb));
    },
  };
}
