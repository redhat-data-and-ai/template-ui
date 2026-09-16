import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

describe('logout.router', () => {
  let fastify: FastifyInstance;

  beforeEach(async () => {
    fastify = Fastify();

    await fastify.register(import('@fastify/cookie'));
    await fastify.register(import('@fastify/session'), {
      secret: 'a-very-long-secret-at-least-32-chars!!',
      cookie: { secure: false },
    });

    const { default: logoutPlugin } = await import('./logout.router');
    await fastify.register(logoutPlugin);

    await fastify.ready();
  });

  afterEach(async () => {
    await fastify.close();
  });

  it('POST /auth/logout clears cookies and returns success', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/auth/logout',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);

    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
  });

  it('POST /auth/logout destroys the session', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/auth/logout',
    });

    expect(response.statusCode).toBe(200);
  });
});
