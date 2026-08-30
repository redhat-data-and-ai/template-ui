import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../../test-utils/render';
import { OAuthConnections } from './OAuthConnections';
import type { McpOAuthConnection } from '../../services/mcp-oauth-api';

vi.mock('../../services/mcp-oauth-api', () => ({
  fetchMcpOAuthConnections: vi.fn(),
  disconnectMcpOAuth: vi.fn(),
  startMcpOAuthConnect: vi.fn(),
  verifyMcpOAuthConnected: vi.fn(),
  openMcpOAuthPopup: vi.fn(),
}));

import {
  disconnectMcpOAuth,
  fetchMcpOAuthConnections,
  openMcpOAuthPopup,
  startMcpOAuthConnect,
  verifyMcpOAuthConnected,
} from '../../services/mcp-oauth-api';

const connected: McpOAuthConnection = {
  mcp_name: 'smartsheet-mcp',
  auth_mode: 'oauth',
  description: 'Smartsheet',
  connected: true,
};

const disconnected: McpOAuthConnection = {
  mcp_name: 'jira-mcp',
  auth_mode: 'dcr',
  description: 'Jira',
  connected: false,
};

describe('OAuthConnections', () => {
  beforeEach(() => {
    vi.mocked(fetchMcpOAuthConnections).mockReset();
    vi.mocked(disconnectMcpOAuth).mockReset();
    vi.mocked(startMcpOAuthConnect).mockReset();
    vi.mocked(openMcpOAuthPopup).mockReset();
    vi.mocked(verifyMcpOAuthConnected).mockReset();
  });

  it('shows an empty state when no OAuth MCPs are configured', async () => {
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([]);
    renderWithProviders(<OAuthConnections />);
    expect(
      await screen.findByText(/no oauth-connected services are configured/i),
    ).toBeInTheDocument();
  });

  it('lists connected and disconnected MCPs with matching actions', async () => {
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([connected, disconnected]);
    renderWithProviders(<OAuthConnections />);

    expect(await screen.findByText('Smartsheet')).toBeInTheDocument();
    expect(screen.getByText('Jira')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /disconnect smartsheet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /re-authenticate smartsheet/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /authenticate jira/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /disconnect jira/i })).not.toBeInTheDocument();
  });

  it('falls back to the MCP name when description is empty', async () => {
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([
      { ...connected, description: '', mcp_name: 'plain-mcp' },
    ]);
    renderWithProviders(<OAuthConnections />);
    expect(await screen.findByText('plain-mcp')).toBeInTheDocument();
  });

  it('disconnects an MCP and refreshes status', async () => {
    vi.mocked(fetchMcpOAuthConnections)
      .mockResolvedValueOnce([connected])
      .mockResolvedValueOnce([{ ...connected, connected: false }]);
    vi.mocked(disconnectMcpOAuth).mockResolvedValue({
      mcp_name: 'smartsheet-mcp',
      connected: false,
    });

    renderWithProviders(<OAuthConnections />);
    await userEvent.click(await screen.findByRole('button', { name: /disconnect smartsheet/i }));

    await waitFor(() => {
      expect(disconnectMcpOAuth).toHaveBeenCalledWith('smartsheet-mcp');
    });
    expect(await screen.findByRole('button', { name: /authenticate smartsheet/i })).toBeInTheDocument();
  });

  it('starts OAuth popup when Authenticate is clicked', async () => {
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([disconnected]);
    vi.mocked(startMcpOAuthConnect).mockResolvedValue({
      authorize_url: 'https://oauth.example.com/auth',
    });
    vi.mocked(openMcpOAuthPopup).mockReturnValue({ origin: 'https://oauth.example.com' });

    renderWithProviders(<OAuthConnections />);
    await userEvent.click(await screen.findByRole('button', { name: /authenticate jira/i }));

    await waitFor(() => {
      expect(startMcpOAuthConnect).toHaveBeenCalledWith('jira-mcp');
      expect(openMcpOAuthPopup).toHaveBeenCalledWith('https://oauth.example.com/auth');
    });
  });

  it('refreshes status after mcp_oauth_done from an allowed origin', async () => {
    vi.mocked(fetchMcpOAuthConnections)
      .mockResolvedValueOnce([disconnected])
      .mockResolvedValue([{ ...disconnected, connected: true }]);
    vi.mocked(startMcpOAuthConnect).mockResolvedValue({
      authorize_url: 'https://oauth.example.com/auth',
    });
    vi.mocked(openMcpOAuthPopup).mockReturnValue({ origin: 'https://oauth.example.com' });
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(true);

    renderWithProviders(<OAuthConnections />);
    await userEvent.click(await screen.findByRole('button', { name: /authenticate jira/i }));

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'mcp_oauth_done', mcp_name: 'jira-mcp' },
        origin: 'https://oauth.example.com',
      }),
    );

    expect(await screen.findByRole('button', { name: /disconnect jira/i })).toBeInTheDocument();
  });

  it('ignores mcp_oauth_done from an untrusted origin', async () => {
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([disconnected]);
    vi.mocked(startMcpOAuthConnect).mockResolvedValue({
      authorize_url: 'https://oauth.example.com/auth',
    });
    vi.mocked(openMcpOAuthPopup).mockReturnValue({ origin: 'https://oauth.example.com' });

    renderWithProviders(<OAuthConnections />);
    await userEvent.click(await screen.findByRole('button', { name: /authenticate jira/i }));
    await waitFor(() => {
      expect(openMcpOAuthPopup).toHaveBeenCalled();
    });
    vi.mocked(fetchMcpOAuthConnections).mockClear();

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'mcp_oauth_done', mcp_name: 'jira-mcp' },
        origin: 'https://evil.example.com',
      }),
    );

    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMcpOAuthConnections).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /disconnect jira/i })).not.toBeInTheDocument();
  });

  it('refreshes status when the window regains focus after starting auth', async () => {
    vi.mocked(fetchMcpOAuthConnections)
      .mockResolvedValueOnce([disconnected])
      .mockResolvedValue([{ ...disconnected, connected: true }]);
    vi.mocked(startMcpOAuthConnect).mockResolvedValue({
      authorize_url: 'https://oauth.example.com/auth',
    });
    vi.mocked(openMcpOAuthPopup).mockReturnValue({ origin: 'https://oauth.example.com' });
    vi.mocked(verifyMcpOAuthConnected).mockResolvedValue(true);

    renderWithProviders(<OAuthConnections />);
    await userEvent.click(await screen.findByRole('button', { name: /authenticate jira/i }));

    fireEvent(window, new Event('focus'));

    expect(await screen.findByRole('button', { name: /disconnect jira/i })).toBeInTheDocument();
  });

  it('shows an error when loading connections fails', async () => {
    vi.mocked(fetchMcpOAuthConnections).mockRejectedValue(new Error('agent down'));
    renderWithProviders(<OAuthConnections />);
    expect(await screen.findByText(/agent down/i)).toBeInTheDocument();
  });
});
