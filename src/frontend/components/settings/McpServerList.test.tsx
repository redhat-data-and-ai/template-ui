import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { McpServerList } from './McpServerList';
import * as oauthApi from '../../services/mcp-oauth-api';

vi.mock('../../services/mcp-oauth-api', () => ({
  fetchMcpOAuthConnections: vi.fn(),
  disconnectMcpOAuth: vi.fn(),
  startMcpOAuthConnect: vi.fn(),
  openMcpOAuthPopup: vi.fn(),
}));

const store = configureStore({
  reducer: { toasts: (state = { items: [] }) => state },
});

function renderList() {
  return render(
    <Provider store={store}>
      <McpServerList />
    </Provider>,
  );
}

/** `GET /mcp/servers`, then per-server `GET /mcp/{name}/capabilities`. */
function stubAgent(
  servers: unknown[],
  capabilities: Record<string, unknown> = {},
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const match = /\/mcp\/([^/]+)\/capabilities/.exec(String(url));
      if (match) {
        const body = capabilities[decodeURIComponent(match[1])];
        if (!body) return new Response('{}', { status: 401 });
        return new Response(JSON.stringify(body), { status: 200 });
      }
      return new Response(JSON.stringify({ servers }), { status: 200 });
    }),
  );
}

beforeEach(() => {
  vi.mocked(oauthApi.fetchMcpOAuthConnections).mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const ATLASSIAN = {
  name: 'atlassian',
  url: 'https://mcp.atlassian.com/v2/mcp',
  transport: 'streamable_http',
  enabled: true,
  auth_mode: 'dcr',
  tool_prefix: 'atlassian',
};

describe('McpServerList', () => {
  it('shows the name and a Connect button when not connected', async () => {
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([]);
    stubAgent([ATLASSIAN]);
    renderList();

    expect(await screen.findByText('atlassian')).toBeInTheDocument();
    // The URL is deliberately not rendered — it crowds the row and
    // answers a question nobody asks of a list.
    expect(screen.queryByText('https://mcp.atlassian.com/v2/mcp')).toBeNull();
    expect(screen.getByRole('button', { name: /^connect atlassian$/i })).toBeEnabled();
  });

  it('turns the dot green and offers Disconnect once connected', async () => {
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([
      { mcp_name: 'atlassian', auth_mode: 'dcr', description: '', connected: true },
    ]);
    stubAgent([ATLASSIAN], {
      atlassian: { tools: 25, resources: 3, prompts: 0 },
    });
    const { container } = renderList();

    await screen.findByText('atlassian');
    expect(
      await screen.findByRole('button', { name: /^disconnect atlassian$/i }),
    ).toBeInTheDocument();
    // The dot is decorative, so it is found by class rather than role.
    await waitFor(() =>
      expect(container.querySelector('.bg-green-500')).not.toBeNull(),
    );
    expect(container.querySelector('.bg-amber-500')).toBeNull();
  });

  it('shows the description, not counts or a URL', async () => {
    // Counts moved onto the modal tabs. Keeping them on the row cost
    // a full MCP session per server on every page load — thirteen
    // handshakes to render a list.
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([
      { mcp_name: 'atlassian', auth_mode: 'dcr', description: '', connected: true },
    ]);
    stubAgent([{ ...ATLASSIAN, description: 'Jira and Confluence.' }]);
    renderList();

    expect(await screen.findByText('Jira and Confluence.')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ tools/)).toBeNull();
    expect(screen.queryByText('https://mcp.atlassian.com/v2/mcp')).toBeNull();
  });

  it('opens a dialog with a tab per capability', async () => {
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([
      { mcp_name: 'atlassian', auth_mode: 'dcr', description: '', connected: true },
    ]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/inventory')) {
          return new Response(
            JSON.stringify({
              tools: [{ name: 'jira_search', description: 'Search issues.' }],
              prompts: [],
              resources: [],
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ servers: [ATLASSIAN] }), { status: 200 });
      }),
    );
    renderList();

    (await screen.findByText('atlassian')).click();

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('Tools (1)')).toBeInTheDocument();
    expect(screen.getByText('Prompts (0)')).toBeInTheDocument();
    expect(screen.getByText('Resources (0)')).toBeInTheDocument();
    // The description is the point of listing them at all.
    expect(await screen.findByText('Search issues.')).toBeInTheDocument();
  });

  it('keeps showing the server when capabilities cannot be read', async () => {
    // A connected server that will not answer must still render as
    // connected; losing the row would read as "not configured".
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([
      { mcp_name: 'atlassian', auth_mode: 'dcr', description: '', connected: true },
    ]);
    stubAgent([ATLASSIAN]); // no capabilities entry -> 401
    renderList();

    expect(await screen.findByText('atlassian')).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: /^disconnect atlassian$/i }),
    ).toBeInTheDocument();
  });

  it('disables Connect for a server that is switched off', async () => {
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([]);
    stubAgent([{ ...ATLASSIAN, enabled: false }]);
    renderList();

    expect(await screen.findByRole('button', { name: /^connect atlassian$/i })).toBeDisabled();
  });
});

describe('McpServerList refresh triggers', () => {
  it('re-reads connections when the window regains focus', async () => {
    // Covers a popup that was blocked, or a flow finished in a normal
    // tab. Without this the row stays on "Connect" until a reload,
    // which is what it looked like when atlan was already connected.
    vi.mocked(oauthApi.fetchMcpOAuthConnections)
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        { mcp_name: 'atlassian', auth_mode: 'dcr', description: '', connected: true },
      ]);
    stubAgent([ATLASSIAN], { atlassian: { tools: 4, resources: null, prompts: null } });
    renderList();

    expect(await screen.findByRole('button', { name: /^connect atlassian$/i })).toBeInTheDocument();
    window.dispatchEvent(new Event('focus'));
    expect(
      await screen.findByRole('button', { name: /^disconnect atlassian$/i }),
    ).toBeInTheDocument();
  });

  it('ignores an mcp_oauth_done message from an unexpected origin', async () => {
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([]);
    stubAgent([ATLASSIAN]);
    renderList();
    await screen.findByText('atlassian');

    const before = vi.mocked(oauthApi.fetchMcpOAuthConnections).mock.calls.length;
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { type: 'mcp_oauth_done' },
        origin: 'https://attacker.example',
      }),
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(vi.mocked(oauthApi.fetchMcpOAuthConnections).mock.calls.length).toBe(before);
  });
});

describe('McpServerList re-register', () => {
  it('offers Re-register only when the agent allows it', async () => {
    // A button that always 403s is worse than no button.
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ servers: [ATLASSIAN], reregister_enabled: false }),
          { status: 200 },
        ),
      ),
    );
    renderList();
    await screen.findByText('atlassian');
    expect(screen.queryByRole('button', { name: /re-register atlassian/i })).toBeNull();
  });

  it('shows Re-register when enabled', async () => {
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({ servers: [ATLASSIAN], reregister_enabled: true }),
          { status: 200 },
        ),
      ),
    );
    renderList();
    expect(
      await screen.findByRole('button', { name: /re-register atlassian/i }),
    ).toBeInTheDocument();
  });

  it('does not offer Re-register for a disabled server', async () => {
    // There is no client to replace.
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([]);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            servers: [{ ...ATLASSIAN, enabled: false }],
            reregister_enabled: true,
          }),
          { status: 200 },
        ),
      ),
    );
    renderList();
    await screen.findByText('atlassian');
    expect(screen.queryByRole('button', { name: /re-register atlassian/i })).toBeNull();
  });
});

describe('McpServerList presentation', () => {
  it('shows the display name, not the key', async () => {
    // Derived title-casing would render "Atlassian" correctly and
    // "Rhsc", "Gworkspace" and "Sumologic" wrongly, so the proper
    // noun is config, not a transformation.
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([]);
    stubAgent([{ ...ATLASSIAN, display_name: 'Atlassian' }]);
    renderList();

    expect(await screen.findByText('Atlassian')).toBeInTheDocument();
    expect(screen.queryByText('atlassian')).toBeNull();
  });

  it('falls back to the key when no display name is set', async () => {
    vi.mocked(oauthApi.fetchMcpOAuthConnections).mockResolvedValue([]);
    stubAgent([ATLASSIAN]);
    renderList();

    expect(await screen.findByText('atlassian')).toBeInTheDocument();
  });
});
