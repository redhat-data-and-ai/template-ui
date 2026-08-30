import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

vi.mock('../lib/app-paths', () => ({
  buildAgentApiUrl: (path: string) => `/api/proxy/agent${path}`,
}));

import { authenticatedFetch } from './authenticated-fetch';
import {
  disconnectMcpOAuth,
  fetchMcpOAuthConnections,
  startMcpOAuthConnect,
  verifyMcpOAuthConnected,
} from './mcp-oauth-api';

describe('mcp-oauth-api', () => {
  beforeEach(() => {
    vi.mocked(authenticatedFetch).mockReset();
  });

  it('fetchMcpOAuthConnections GETs the connections list', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          connections: [
            {
              mcp_name: 'smartsheet-mcp',
              auth_mode: 'oauth',
              description: 'Smartsheet',
              connected: true,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const result = await fetchMcpOAuthConnections();

    expect(authenticatedFetch).toHaveBeenCalledWith('/api/proxy/agent/mcp/oauth/connections', {
      method: 'GET',
    });
    expect(result).toEqual([
      {
        mcp_name: 'smartsheet-mcp',
        auth_mode: 'oauth',
        description: 'Smartsheet',
        connected: true,
      },
    ]);
  });

  it('fetchMcpOAuthConnections rejects non-OK responses', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response('boom', { status: 502 }),
    );

    await expect(fetchMcpOAuthConnections()).rejects.toThrow(/boom/);
  });

  it('disconnectMcpOAuth DELETEs the per-MCP disconnect route', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ mcp_name: 'smartsheet-mcp', connected: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await disconnectMcpOAuth('smartsheet-mcp');

    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/mcp/smartsheet-mcp/disconnect',
      { method: 'DELETE' },
    );
    expect(result).toEqual({ mcp_name: 'smartsheet-mcp', connected: false });
  });

  it('startMcpOAuthConnect POSTs connect and returns authorize_url', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ authorize_url: 'https://oauth.example.com/auth' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await startMcpOAuthConnect('smartsheet-mcp');

    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/mcp/smartsheet-mcp/connect',
      { method: 'POST' },
    );
    expect(result.authorize_url).toBe('https://oauth.example.com/auth');
  });

  it('startMcpOAuthConnect rejects a response without authorize_url', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(startMcpOAuthConnect('smartsheet-mcp')).rejects.toThrow(/authorize_url/);
  });

  it('verifyMcpOAuthConnected returns true when status is connected', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ connected: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(verifyMcpOAuthConnected('smartsheet-mcp')).resolves.toBe(true);
    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/mcp/smartsheet-mcp/status',
      { method: 'GET' },
    );
  });

  it('verifyMcpOAuthConnected does not retry after a rate-limit error', async () => {
    vi.mocked(authenticatedFetch).mockRejectedValue(
      new Error('Rate limited. Retry after 5000ms'),
    );

    await expect(verifyMcpOAuthConnected('smartsheet-mcp')).resolves.toBe(false);
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
  });

  it('encodes MCP names in path segments', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ connected: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await disconnectMcpOAuth('sheet mcp');

    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/mcp/sheet%20mcp/disconnect',
      { method: 'DELETE' },
    );
  });
});
