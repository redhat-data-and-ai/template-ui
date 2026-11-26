import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildTestServer } from './test-utils.js';
import { resetSettings } from '../utils/settings.js';

beforeEach(() => {
  process.env.AGENT_HOST = 'http://127.0.0.1:19999';
  resetSettings();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AGENT_HOST;
  resetSettings();
});

describe('GET /api/config/agent-structure', () => {
  it('proxies the developer structure from the agent', async () => {
    const structure = { name: 'orchestrator', orchestrator: {}, subagents: {}, mcp_servers: {}, skills: {} };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(structure), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const server = await buildTestServer();

    const response = await server.inject({ method: 'GET', url: '/api/config/agent-structure' });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual(structure);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:19999/config/agent-structure', {
      signal: expect.any(AbortSignal),
    });
  });

  it('returns 502 when the agent is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const server = await buildTestServer();

    const response = await server.inject({ method: 'GET', url: '/api/config/agent-structure' });

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({ error: 'Unable to reach agent' });
  });
});

describe('GET /api/config/subagents', () => {
  beforeEach(() => {
    process.env.AUTH_ENABLED = 'false';
  });

  afterEach(() => {
    delete process.env.AUTH_ENABLED;
  });

  it('proxies the subagent catalog without storing it', async () => {
    const catalog = {
      subagents: [{ name: 'analyst', description: 'Calculates BMI.' }],
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(catalog), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const server = await buildTestServer();

    const response = await server.inject({ method: 'GET', url: '/api/config/subagents' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(JSON.parse(response.body)).toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:19999/config/subagents', {
      signal: expect.any(AbortSignal),
    });
  });

  it('forwards an agent error status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 503 })));
    const server = await buildTestServer();

    const response = await server.inject({ method: 'GET', url: '/api/config/subagents' });

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body)).toEqual({ error: 'Unable to load subagents' });
  });

  it('returns 502 when the agent is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const server = await buildTestServer();

    const response = await server.inject({ method: 'GET', url: '/api/config/subagents' });

    expect(response.statusCode).toBe(502);
    expect(JSON.parse(response.body)).toEqual({ error: 'Unable to reach agent' });
  });
});
