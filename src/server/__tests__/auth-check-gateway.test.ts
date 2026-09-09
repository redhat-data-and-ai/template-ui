import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestServer } from './test-utils.js';
import { resetSettings } from '../utils/settings.js';

function jwtWithRoles(roles: string[]): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({ sub: 'user-1', realm_access: { roles } }),
  ).toString('base64url');
  return `${header}.${payload}.sig`;
}

function gatewayHeaders(roles: string[]) {
  return {
    'x-auth-user-email': 'user@example.com',
    'x-auth-user-name': 'Test User',
    'x-auth-user-sub': 'user-1',
    'x-token': jwtWithRoles(roles),
  };
}

beforeEach(() => {
  process.env.FEATURE_AUTH_ENABLED = 'false';
  process.env.AUTH_ENABLED = 'false';
  process.env.AGENT_HOST = 'http://127.0.0.1:19999';
  process.env.DEVELOPER_GROUP = 'devs';
  process.env.USER_GROUP = 'users';
  resetSettings();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AGENT_HOST;
  delete process.env.AUTH_ENABLED;
  delete process.env.DEVELOPER_GROUP;
  delete process.env.USER_GROUP;
  resetSettings();
});

describe('gateway mode group access (AUTH_ENABLED=false)', () => {
  it('returns 403 on eval trigger when JWT has only USER_GROUP', async () => {
    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/evals/trigger',
      headers: gatewayHeaders(['users']),
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toEqual({
      error: 'forbidden',
      message: 'Eval access requires developer role.',
    });
  });

  it('returns 403 access_denied when JWT has neither group', async () => {
    const server = await buildTestServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/history/thread-abc',
      headers: gatewayHeaders(['other-role']),
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toEqual({
      error: 'access_denied',
      message: 'You do not have access to this application.',
    });
  });

  it('allows eval trigger when JWT has DEVELOPER_GROUP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ eval_status: 'in_progress' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/evals/trigger',
      headers: gatewayHeaders(['devs']),
      payload: {},
    });

    expect(res.statusCode).toBe(200);
  });

  it('denies access when groups are configured but no gateway token is present', async () => {
    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/evals/trigger',
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toEqual({
      error: 'access_denied',
      message: 'You do not have access to this application.',
    });
  });

  it('allows access when no groups are configured and no gateway token is present', async () => {
    delete process.env.DEVELOPER_GROUP;
    delete process.env.USER_GROUP;
    resetSettings();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ eval_status: 'in_progress' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/evals/trigger',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
  });
});
