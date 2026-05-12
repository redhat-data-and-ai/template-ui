import { Redis } from 'ioredis';

let redisClient: Redis | null = null;

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
      retryStrategy(times) {
        if (times > 5) return null;
        return Math.min(times * 200, 2000);
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
    return client;
  } catch (err) {
    console.warn('[Redis] Failed to connect, falling back to in-memory sessions:', err);
    redisClient = null;
    return null;
  }
}
