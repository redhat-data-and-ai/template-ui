import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAgentStructure } from './agent-structure';

describe('fetchAgentStructure', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (window as Window & { APP_DATA: { basePath: string } }).APP_DATA = { basePath: '/' };
  });

  it('fetches the agent structure from the UI BFF', async () => {
    const structure = {
      name: 'orchestrator',
      orchestrator: { name: 'orchestrator' },
      subagents: {},
      mcp_servers: {},
      available_skills: [],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(structure),
    }));

    await expect(fetchAgentStructure()).resolves.toEqual(structure);
    expect(fetch).toHaveBeenCalledWith('/api/config/agent-structure', { cache: 'no-store' });
  });

  it('uses the application base path', async () => {
    (window as Window & { APP_DATA: { basePath: string } }).APP_DATA = { basePath: '/agents/example' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));

    await fetchAgentStructure();

    expect(fetch).toHaveBeenCalledWith('/agents/example/api/config/agent-structure', { cache: 'no-store' });
  });

  it('throws when the UI BFF cannot provide the structure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    await expect(fetchAgentStructure()).rejects.toThrow('Failed to load agent structure');
  });
});
