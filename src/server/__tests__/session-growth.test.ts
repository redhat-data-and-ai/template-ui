import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildTestServer } from './test-utils.js';
import { resetSettings } from '../utils/settings.js';

/**
 * An anonymous request must not create a session.
 *
 * `@fastify/session` persists uninitialised sessions by default, so
 * every cookie-less request — health probes, unauthenticated API
 * calls, crawlers — wrote a record holding nothing but a cookie
 * object, with the full 30-day TTL. They pile up in the same Redis
 * the agent uses for its worker queue and lease recovery, which
 * makes it a slow squeeze on something that matters.
 */

beforeEach(() => {
  process.env.AUTH_ENABLED = 'false';
  process.env.FEATURE_AUTH_ENABLED = 'false';
  resetSettings();
});

afterEach(() => {
  delete process.env.AUTH_ENABLED;
  resetSettings();
});

describe('session creation', () => {
  it('sets no session cookie on an anonymous request', async () => {
    const server = await buildTestServer();
    const response = await server.inject({
      method: 'GET',
      url: '/api/config/branding',
    });

    const cookies = ([] as string[]).concat(
      (response.headers['set-cookie'] as string | string[] | undefined) ?? [],
    );
    expect(cookies.filter((c) => c.startsWith('sessionId'))).toEqual([]);
    await server.close();
  });

  it('sets none on a health probe either', async () => {
    // The probe runs every few seconds for the life of the pod, so
    // this is the one that turns a leak into a flood.
    const server = await buildTestServer();
    const response = await server.inject({ method: 'GET', url: '/api/health' });

    const cookies = ([] as string[]).concat(
      (response.headers['set-cookie'] as string | string[] | undefined) ?? [],
    );
    expect(cookies.filter((c) => c.startsWith('sessionId'))).toEqual([]);
    await server.close();
  });
});
