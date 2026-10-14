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
  it('proxies the sanitized structure from the agent', async () => {
    const structure = { name: 'orchestrator', orchestrator: {}, subagents: {}, mcp_servers: {}, available_skills: [] };
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
