import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) => (o?.name ? `${k}:${o.name}` : k),
  }),
}));

vi.mock('react-redux', () => ({ useDispatch: () => vi.fn() }));

vi.mock('../services/mcp-oauth-api', () => ({
  openMcpOAuthPopup: vi.fn(),
  startMcpOAuthConnect: vi.fn(),
  verifyMcpOAuthConnected: vi.fn(),
}));

import { McpAuthPrompt } from './McpAuthPrompt';
import { verifyMcpOAuthConnected } from '../services/mcp-oauth-api';

const requests = [{ mcpName: 'dataverse', reason: 'not_connected' }];

describe('McpAuthPrompt — staleness', () => {
  beforeEach(() => {
    vi.mocked(verifyMcpOAuthConnected).mockReset();
  });

  it('hides itself once the integration is connected elsewhere', async () => {
    // The prompt is pinned to a message and a message does not
    // change. Connecting from the settings page left this banner
    // insisting the opposite, on a turn the user had already fixed.
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(true);

    render(<McpAuthPrompt requests={requests} />);

    await waitFor(() =>
      expect(screen.queryByTestId('mcp-auth-prompt')).not.toBeInTheDocument(),
    );
  });

  it('stays while the integration is still disconnected', async () => {
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(false);

    render(<McpAuthPrompt requests={requests} />);

    expect(await screen.findByTestId('mcp-auth-prompt')).toBeInTheDocument();
  });

  it('names the integration readably rather than as an identifier', async () => {
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(false);

    render(
      <McpAuthPrompt requests={[{ mcpName: 'unstructured-data', reason: 'not_connected' }]} />,
    );

    expect(
      await screen.findByText('mcpAuth.notConnected:Unstructured data'),
    ).toBeInTheDocument();
  });

  it('re-checks when the tab regains focus', async () => {
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(false);
    render(<McpAuthPrompt requests={requests} />);
    await screen.findByTestId('mcp-auth-prompt');

    // Connected in the other tab the user just came back from.
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(true);
    window.dispatchEvent(new Event('focus'));

    await waitFor(() =>
      expect(screen.queryByTestId('mcp-auth-prompt')).not.toBeInTheDocument(),
    );
  });

  it('resumes when the integration is connected somewhere else', async () => {
    // The popup watcher is not the only way a connection happens, and
    // it was the only thing that triggered a resume. Hiding the
    // prompt on focus unmounted the component and cleared that
    // watcher before it fired — so connecting Atlan and coming back
    // left the chat sitting there.
    const onConnected = vi.fn();
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(false);

    render(<McpAuthPrompt requests={requests} onConnected={onConnected} />);
    await screen.findByTestId('mcp-auth-prompt');

    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(true);
    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(onConnected).toHaveBeenCalledWith('dataverse'));
  });

  it('resumes once, not once per focus', async () => {
    const onConnected = vi.fn();
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(false);

    render(<McpAuthPrompt requests={requests} onConnected={onConnected} />);
    await screen.findByTestId('mcp-auth-prompt');

    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(true);
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => expect(onConnected).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 50));
    expect(onConnected).toHaveBeenCalledTimes(1);
  });

  it('does not resume a turn whose integration was already connected', async () => {
    // Nothing changed for the reader, so nothing should be re-sent.
    const onConnected = vi.fn();
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(true);

    render(<McpAuthPrompt requests={requests} onConnected={onConnected} />);
    await new Promise((r) => setTimeout(r, 50));

    expect(onConnected).not.toHaveBeenCalled();
  });
});
