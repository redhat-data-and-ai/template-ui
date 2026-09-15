import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { createTestStore } from '../test-utils/createTestStore';
import { setAutoApproveAllTools } from '../redux/slices/userSettings';
import { usePreStreamGate } from './usePreStreamGate';

vi.mock('../services/mcp-oauth-api', () => ({
  fetchMcpOAuthConnections: vi.fn(),
  startMcpOAuthConnect: vi.fn(),
  openMcpOAuthPopup: vi.fn(),
  disconnectMcpOAuth: vi.fn(),
  verifyMcpOAuthConnected: vi.fn(),
}));

import {
  fetchMcpOAuthConnections,
  openMcpOAuthPopup,
  startMcpOAuthConnect,
} from '../services/mcp-oauth-api';

const disconnected = {
  mcp_name: 'jira-mcp',
  auth_mode: 'dcr',
  description: 'Jira',
  connected: false,
};

function Harness() {
  const { ensureReady, modal } = usePreStreamGate();
  const [result, setResult] = useState('');
  const [second, setSecond] = useState('');
  return (
    <>
      <button type="button" onClick={() => void ensureReady().then((value) => setResult(String(value)))}>
        Check
      </button>
      <button
        type="button"
        data-testid="check-again"
        onClick={() => void ensureReady().then((value) => setSecond(String(value)))}
      >
        Check again
      </button>
      <div data-testid="gate-result">{result}</div>
      <div data-testid="gate-result-second">{second}</div>
      {modal}
    </>
  );
}

function renderHarness(store = createTestStore()) {
  return render(
    <Provider store={store}>
      <Harness />
    </Provider>,
  );
}

describe('usePreStreamGate', () => {
  beforeEach(() => {
    vi.mocked(fetchMcpOAuthConnections).mockReset();
    vi.mocked(startMcpOAuthConnect).mockReset();
    vi.mocked(openMcpOAuthPopup).mockReset();
    localStorage.clear();
  });

  it('resolves true immediately when auto-approve is on and no MCPs need auth', async () => {
    const user = userEvent.setup();
    const store = createTestStore();
    store.dispatch(setAutoApproveAllTools(true));
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([]);
    renderHarness(store);

    await user.click(screen.getByRole('button', { name: 'Check' }));
    await waitFor(() => {
      expect(screen.getByTestId('gate-result')).toHaveTextContent('true');
    });
    expect(screen.queryByRole('dialog', { name: /connect before chatting/i })).not.toBeInTheDocument();
  });

  it('resolves false when the user cancels the modal', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([]);
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.getByTestId('gate-result')).toHaveTextContent('false');
    });
  });

  it('keeps Continue disabled when an OAuth MCP is disconnected', async () => {
    const user = userEvent.setup();
    const store = createTestStore();
    store.dispatch(setAutoApproveAllTools(true));
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([disconnected]);
    renderHarness(store);

    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /authenticate jira/i })).toBeInTheDocument();
  });

  it('rejects a second ensureReady caller while the modal is open', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([]);
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('check-again'));
    await waitFor(() => {
      expect(screen.getByTestId('gate-result-second')).toHaveTextContent('false');
    });
    expect(screen.getByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
  });

  it('keeps Continue disabled when the connections list fails to load', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMcpOAuthConnections).mockRejectedValue(new Error('agent down'));
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
    expect(screen.getByText('agent down')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
  });

  it('re-checks connections on Continue and stays open if an MCP is still disconnected', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchMcpOAuthConnections)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([disconnected]);
    renderHarness();

    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /auto-approve all tools/i }));
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(fetchMcpOAuthConnections).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(screen.getByTestId('gate-result')).toHaveTextContent('');
  });

  it('does not refresh OAuth status on window focus after Cancel', async () => {
    const user = userEvent.setup();
    const store = createTestStore();
    store.dispatch(setAutoApproveAllTools(true));
    vi.mocked(fetchMcpOAuthConnections).mockResolvedValue([disconnected]);
    vi.mocked(startMcpOAuthConnect).mockResolvedValue({ authorize_url: 'https://auth.example/authorize' });
    vi.mocked(openMcpOAuthPopup).mockReturnValue({
      origin: 'https://auth.example',
      popup: { closed: false } as Window,
    });
    renderHarness(store);

    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByRole('dialog', { name: /connect before chatting/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /authenticate jira/i }));
    await waitFor(() => {
      expect(startMcpOAuthConnect).toHaveBeenCalledWith('jira-mcp');
    });
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => {
      expect(screen.getByTestId('gate-result')).toHaveTextContent('false');
    });

    const calls = vi.mocked(fetchMcpOAuthConnections).mock.calls.length;
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(fetchMcpOAuthConnections).toHaveBeenCalledTimes(calls);
  });
});
