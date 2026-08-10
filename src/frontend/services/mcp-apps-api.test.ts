import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

vi.mock('../lib/app-paths', () => ({
  buildAgentApiUrl: (path: string) => `/api/proxy/agent${path}`,
}));

import { authenticatedFetch } from './authenticated-fetch';
import {
  callMcpAppTool,
  listMcpAppResources,
  listMcpAppResourceTemplates,
  readMcpAppResource,
} from './mcp-apps-api';

describe('mcp-apps-api', () => {
  beforeEach(() => {
    vi.mocked(authenticatedFetch).mockReset();
  });

  it('readMcpAppResource posts any resource uri to the proxy', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ contents: [{ text: '{"ok":true}' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await readMcpAppResource('charts', 'showcase://sample.json');

    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/mcp/charts/resources/read',
      {
        method: 'POST',
        body: JSON.stringify({ uri: 'showcase://sample.json' }),
      },
    );
    expect(result.contents?.[0]?.text).toBe('{"ok":true}');
  });

  it('readMcpAppResource rejects empty uri before fetch', async () => {
    await expect(readMcpAppResource('charts', '')).rejects.toThrow(/uri is required/);
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });

  it('listMcpAppResources posts to resources/list', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ resources: [{ uri: 'showcase://sample.json' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await listMcpAppResources('charts', 'next');

    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/mcp/charts/resources/list',
      {
        method: 'POST',
        body: JSON.stringify({ cursor: 'next' }),
      },
    );
    expect(result.resources?.[0]?.uri).toBe('showcase://sample.json');
  });

  it('listMcpAppResourceTemplates posts to resources/templates/list', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(
        JSON.stringify({ resourceTemplates: [{ uriTemplate: 'showcase://{id}' }] }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );

    const result = await listMcpAppResourceTemplates('charts', 'c1');

    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/mcp/charts/resources/templates/list',
      {
        method: 'POST',
        body: JSON.stringify({ cursor: 'c1' }),
      },
    );
    expect(result.resourceTemplates?.[0]?.uriTemplate).toBe('showcase://{id}');
  });

  it('callMcpAppTool posts tool name and arguments', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(JSON.stringify({ content: [], structuredContent: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const result = await callMcpAppTool('charts', 'refresh_showcase', { topic: 'a' });

    expect(authenticatedFetch).toHaveBeenCalledWith(
      '/api/proxy/agent/mcp/charts/tools/call',
      {
        method: 'POST',
        body: JSON.stringify({ name: 'refresh_showcase', arguments: { topic: 'a' } }),
      },
    );
    expect(result.structuredContent).toEqual({ ok: true });
  });
});
