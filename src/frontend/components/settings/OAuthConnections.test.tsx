import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor, fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { configureStore } from '@reduxjs/toolkit';
import { renderWithProviders } from '../../test-utils/render';
import { OAuthConnections } from './OAuthConnections';
import type { McpOAuthConnection } from '../../services/mcp-oauth-api';
import chatsReducer from '../../redux/slices/chats';
import configReducer from '../../redux/slices/config';
import personalizationReducer from '../../redux/slices/personalization';
import toastsReducer from '../../redux/slices/toasts';
import userSettingsReducer from '../../redux/slices/userSettings';
import projectsReducer from '../../redux/slices/projects';

vi.mock('../../services/mcp-oauth-api', () => ({
  fetchMcpOAuthConnections: vi.fn(),
  disconnectMcpOAuth: vi.fn(),
  startMcpOAuthConnect: vi.fn(),
  verifyMcpOAuthConnected: vi.fn(),
  openMcpOAuthPopup: vi.fn(),
  reregisterMcpOAuth: vi.fn(),
}));

vi.mock('../../lib/role-utils', () => ({
  isPrivilegedUser: vi.fn(() => false),
}));

import {
  disconnectMcpOAuth,
  fetchMcpOAuthConnections,
  openMcpOAuthPopup,
  reregisterMcpOAuth,
  startMcpOAuthConnect,
  verifyMcpOAuthConnected,
} from '../../services/mcp-oauth-api';

import { isPrivilegedUser } from '../../lib/role-utils';

function renderWithDeveloperMode(ui: React.ReactElement) {
  const store = configureStore({
    reducer: {
      chats: chatsReducer,
      config: configReducer,
      personalization: personalizationReducer,
      toasts: toastsReducer,
      userSettings: userSettingsReducer,
      projects: projectsReducer,
    },
    preloadedState: {
      userSettings: {
        theme: 'dark' as const,
        debugMode: false,
        developerMode: true,
        alwaysAllowedTools: [],
        autoApproveAllTools: false,
        _userOverrides: {},
      },
    },
  });
  const result = render(
    <Provider store={store}>
      <MemoryRouter>{ui}</MemoryRouter>
    </Provider>,
  );
  return { ...result, store };
}

const connected: McpOAuthConnection = {
  mcp_name: 'smartsheet-mcp',
  auth_mode: 'oauth',
  description: 'Smartsheet tools',
  display_name: 'Smartsheet',
  connected: true,
};

const disconnected: McpOAuthConnection = {
  mcp_name: 'jira-mcp',
  auth_mode: 'dcr',
  description: 'Jira tools',
  display_name: 'Jira',
  connected: false,
};

describe('OAuthConnections', () => {
  beforeEach(() => {
    vi.mocked(fetchMcpOAuthConnections).mockReset();
    vi.mocked(disconnectMcpOAuth).mockReset();
    vi.mocked(startMcpOAuthConnect).mockReset();
    vi.mocked(openMcpOAuthPopup).mockReset();
    vi.mocked(verifyMcpOAuthConnected).mockReset();
    vi.mocked(reregisterMcpOAuth).mockReset();
    vi.mocked(isPrivilegedUser).mockReturnValue(false);
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

  it('prefers display_name over description when present', async () => {
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([
      { ...connected, display_name: 'Friendly Name', description: 'Long description' },
    ]);
    renderWithProviders(<OAuthConnections />);
    expect(await screen.findByText('Friendly Name')).toBeInTheDocument();
    expect(screen.queryByText('Long description')).not.toBeInTheDocument();
  });

  it('falls back to mcp_name when display_name is empty', async () => {
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([
      { ...connected, display_name: '', mcp_name: 'smartsheet-mcp' },
    ]);
    renderWithProviders(<OAuthConnections />);
    expect(await screen.findByText('smartsheet-mcp')).toBeInTheDocument();
  });

  it('falls back to mcp_name when display_name is missing', async () => {
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([
      { ...connected, display_name: undefined, description: 'Some description', mcp_name: 'raw-key' },
    ]);
    renderWithProviders(<OAuthConnections />);
    expect(await screen.findByText('raw-key')).toBeInTheDocument();
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

  it('hides Re-register button when developer mode is off', async () => {
    vi.mocked(isPrivilegedUser).mockReturnValue(true);
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([disconnected]);
    renderWithProviders(<OAuthConnections />);
    expect(await screen.findByText('Jira')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /re-register jira/i })).not.toBeInTheDocument();
  });

  it('hides Re-register button when user is not privileged', async () => {
    vi.mocked(isPrivilegedUser).mockReturnValue(false);
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([disconnected]);
    renderWithDeveloperMode(<OAuthConnections />);
    expect(await screen.findByText('Jira')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /re-register jira/i })).not.toBeInTheDocument();
  });

  it('shows Re-register button for DCR MCP when developer mode is on and user is privileged', async () => {
    vi.mocked(isPrivilegedUser).mockReturnValue(true);
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([disconnected]);
    renderWithDeveloperMode(<OAuthConnections />);
    expect(await screen.findByText('Jira')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /re-register jira/i })).toBeInTheDocument();
  });

  it('hides Re-register button for non-DCR (oauth) MCP even in developer mode', async () => {
    vi.mocked(isPrivilegedUser).mockReturnValue(true);
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([connected]);
    renderWithDeveloperMode(<OAuthConnections />);
    expect(await screen.findByText('Smartsheet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /re-register smartsheet/i })).not.toBeInTheDocument();
  });

  it('calls reregisterMcpOAuth and shows success toast', async () => {
    vi.mocked(isPrivilegedUser).mockReturnValue(true);
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([disconnected]);
    vi.mocked(reregisterMcpOAuth).mockResolvedValue({
      mcp_name: 'jira-mcp',
      re_registered: true,
      client_id: 'new-client-id',
    });

    const { store } = renderWithDeveloperMode(<OAuthConnections />);
    await userEvent.click(await screen.findByRole('button', { name: /re-register jira/i }));

    await waitFor(() => {
      expect(reregisterMcpOAuth).toHaveBeenCalledWith('jira-mcp');
    });

    await waitFor(() => {
      const toasts = store.getState().toasts.toasts;
      expect(toasts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: 'Re-registered Jira', variant: 'success' }),
        ]),
      );
    });
  });
});
