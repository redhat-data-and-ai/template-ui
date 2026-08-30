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
  openMcpOAuthPopup,
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

  it('verifyMcpOAuthConnected returns false after a single disconnected status', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ connected: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(verifyMcpOAuthConnected('smartsheet-mcp')).resolves.toBe(false);
    expect(authenticatedFetch).toHaveBeenCalledTimes(1);
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

describe('openMcpOAuthPopup', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockReturnValue(window);
    openSpy.mockClear();
  });

  it('opens https authorization URLs', () => {
    const result = openMcpOAuthPopup('https://oauth.example.com/auth');
    expect(openSpy).toHaveBeenCalledWith(
      'https://oauth.example.com/auth',
      'mcp-oauth',
      'width=600,height=700',
    );
    expect(result.origin).toBe('https://oauth.example.com');
  });

  it('opens http URLs on localhost', () => {
    openMcpOAuthPopup('http://localhost:8080/auth');
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('opens http URLs on 127.0.0.1', () => {
    openMcpOAuthPopup('http://127.0.0.1:9000/auth');
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects javascript URLs without opening a popup', () => {
    expect(() => openMcpOAuthPopup('javascript:alert(1)')).toThrow(/invalid authorization url/i);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('rejects data URLs without opening a popup', () => {
    expect(() => openMcpOAuthPopup('data:text/html,hi')).toThrow(/invalid authorization url/i);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('rejects non-local http URLs without opening a popup', () => {
    expect(() => openMcpOAuthPopup('http://evil.example.com/auth')).toThrow(
      /invalid authorization url/i,
    );
    expect(openSpy).not.toHaveBeenCalled();
  });
});
