import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { render } from '@testing-library/react';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from './HomePage';
import { createTestStore } from '../test-utils/createTestStore';
import { setAutoApproveAllTools } from '../redux/slices/userSettings';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../services/mcp-oauth-api', () => ({
  fetchMcpOAuthConnections: vi.fn(),
  startMcpOAuthConnect: vi.fn(),
  openMcpOAuthPopup: vi.fn(),
  disconnectMcpOAuth: vi.fn(),
  verifyMcpOAuthConnected: vi.fn(),
}));

import { fetchMcpOAuthConnections } from '../services/mcp-oauth-api';

function renderHome(store = createTestStore()) {
  return {
    store,
    ...render(
      <Provider store={store}>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </Provider>,
    ),
  };
}

describe('HomePage — pre-stream gate', () => {
  beforeEach(() => {
    mockNavigate.mockReset();
    vi.mocked(fetchMcpOAuthConnections).mockReset();
    localStorage.clear();
  });

  it('opens the setup modal and keeps the typed prompt on cancel', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([]);
    renderHome();

    const box = screen.getByRole('textbox', { name: /enter a prompt/i });
    await user.type(box, 'hello agent');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(mockNavigate).not.toHaveBeenCalled();
    expect(box).toHaveValue('hello agent');
  });

  it('starts a chat after enabling auto-approve in the modal', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([]);
    renderHome();

    const box = screen.getByRole('textbox', { name: /enter a prompt/i });
    await user.type(box, 'hello agent');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /auto-approve all tools/i }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  it('starts a chat when auto-approve is on and every MCP is connected', async () => {
    const user = userEvent.setup();
    const store = createTestStore();
    store.dispatch(setAutoApproveAllTools(true));
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([]);
    renderHome(store);

    const box = screen.getByRole('textbox', { name: /enter a prompt/i });
    await user.type(box, 'hello agent');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
    expect(mockNavigate.mock.calls[0][0]).toMatch(/^\/chat\//);
  });

  it('sends the current textarea text after Continue, not the text from the first click', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([]);
    renderHome();

    const box = screen.getByRole('textbox', { name: /enter a prompt/i });
    await user.type(box, 'hello agent');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
    await user.type(box, ' now');
    await user.click(screen.getByRole('switch', { name: /auto-approve all tools/i }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
    expect(mockNavigate.mock.calls[0][1]).toEqual({
      state: { initialPrompt: 'hello agent now' },
    });
  });

  it('allows another send if navigation fails after Continue', async () => {
    const user = userEvent.setup();
    const store = createTestStore();
    store.dispatch(setAutoApproveAllTools(true));
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([]);
    mockNavigate.mockImplementation(() => {
      throw new Error('navigation failed');
    });
    renderHome(store);

    const box = screen.getByRole('textbox', { name: /enter a prompt/i });
    await user.type(box, 'hello agent');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });

    mockNavigate.mockReset();
    mockNavigate.mockImplementation(() => undefined);
    await user.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledTimes(1);
    });
  });

  it('opens the setup modal when auto-approve is on but an MCP is disconnected', async () => {
    const user = userEvent.setup();
    const store = createTestStore();
    store.dispatch(setAutoApproveAllTools(true));
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([
      {
        mcp_name: 'jira-mcp',
        auth_mode: 'dcr',
        description: 'Jira',
        connected: false,
      },
    ]);
    renderHome(store);

    const box = screen.getByRole('textbox', { name: /enter a prompt/i });
    await user.type(box, 'hello agent');
    await user.click(screen.getByRole('button', { name: /send message/i }));

    expect(await screen.findByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
