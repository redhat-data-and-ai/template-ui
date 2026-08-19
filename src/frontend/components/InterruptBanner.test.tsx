import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InterruptBanner } from './InterruptBanner';
import type { InterruptInfo } from '../types/deep-agent';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const toolApprovalInterrupt: InterruptInfo = {
  value: 'Do you approve this action? Please confirm or reject.',
  resumable: true,
};

const genericInterrupt: InterruptInfo = {
  value: 'What format would you prefer for the output?',
  resumable: true,
};

const mcpAuthInterrupt: InterruptInfo = {
  value: '',
  resumable: true,
  payload: {
    type: 'mcp_auth_required',
    mcp_name: 'github',
    connect_url: '/api/proxy/agent/mcp/github/connect',
    message: 'Connect your GitHub account.',
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InterruptBanner — tool approval branch', () => {
  it('renders "Action Required" for an approval interrupt', () => {
    render(
      <InterruptBanner interrupt={toolApprovalInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByText('Action Required')).toBeInTheDocument();
  });

  it('renders Approve and Reject buttons', () => {
    render(
      <InterruptBanner interrupt={toolApprovalInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument();
  });

  it('calls onResume("approved") when Approve is clicked', async () => {
    const onResume = vi.fn();
    render(<InterruptBanner interrupt={toolApprovalInterrupt} onResume={onResume} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onResume).toHaveBeenCalledWith('approved');
  });

  it('calls onResume("rejected") when Reject is clicked', async () => {
    const onResume = vi.fn();
    render(<InterruptBanner interrupt={toolApprovalInterrupt} onResume={onResume} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /reject/i }));
    expect(onResume).toHaveBeenCalledWith('rejected');
  });

  it('calls onDismiss when the close button is clicked', async () => {
    const onDismiss = vi.fn();
    render(<InterruptBanner interrupt={toolApprovalInterrupt} onResume={vi.fn()} onDismiss={onDismiss} />);
    const closeBtn = screen.getByRole('button', { name: /close/i });
    await userEvent.click(closeBtn);
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it('renders the interrupt value text in the body', () => {
    render(
      <InterruptBanner interrupt={toolApprovalInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByText(/do you approve/i)).toBeInTheDocument();
  });

  // NOTE: in production, structured HITLInterruptValue interrupts (with action_requests)
  // are routed through ChatPage → ChatMessagesView → AIMessageRenderer, NOT through
  // InterruptBanner.  Those flows are covered by AIMessageRenderer.test.tsx.
});

describe('InterruptBanner — generic input branch', () => {
  it('renders "Input Required" for a non-approval interrupt', () => {
    render(
      <InterruptBanner interrupt={genericInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByText('Input Required')).toBeInTheDocument();
  });

  it('renders a text input and Send button', () => {
    render(
      <InterruptBanner interrupt={genericInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByRole('textbox', { name: /interrupt response/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('Send button is disabled when input is empty', () => {
    render(
      <InterruptBanner interrupt={genericInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /send/i })).toBeDisabled();
  });

  it('calls onResume with the typed text when Send is clicked', async () => {
    const onResume = vi.fn();
    render(<InterruptBanner interrupt={genericInterrupt} onResume={onResume} onDismiss={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: /interrupt response/i });
    await userEvent.type(input, 'JSON format please');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onResume).toHaveBeenCalledWith('JSON format please');
  });

  it('calls onResume when Enter is pressed in the input', async () => {
    const onResume = vi.fn();
    render(<InterruptBanner interrupt={genericInterrupt} onResume={onResume} onDismiss={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: /interrupt response/i });
    await userEvent.type(input, 'My response');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onResume).toHaveBeenCalledWith('My response');
  });

  it('does NOT call onResume on Enter when input is empty', () => {
    const onResume = vi.fn();
    render(<InterruptBanner interrupt={genericInterrupt} onResume={onResume} onDismiss={vi.fn()} />);
    const input = screen.getByRole('textbox', { name: /interrupt response/i });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onResume).not.toHaveBeenCalled();
  });
});

describe('InterruptBanner — MCP auth branch', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Authenticate button for mcp_auth_required', () => {
    render(
      <InterruptBanner interrupt={mcpAuthInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /authenticate/i })).toBeInTheDocument();
  });

  it('does NOT render Approve / Reject buttons for MCP auth', () => {
    render(
      <InterruptBanner interrupt={mcpAuthInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: /approve/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
  });

  it('opens the OAuth popup when Authenticate is clicked', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ authorize_url: 'https://oauth.example.com/auth' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    render(<InterruptBanner interrupt={mcpAuthInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /authenticate/i }));
    await waitFor(() => {
      expect(vi.mocked(open)).toHaveBeenCalledWith(
        'https://oauth.example.com/auth',
        'mcp-oauth',
        expect.stringContaining('width='),
      );
    });
  });

  it('shows an error when the connect request fails', async () => {
    // Empty body → InterruptBanner renders "Connect failed (401)" as the error
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('', { status: 401 }),
    );
    render(<InterruptBanner interrupt={mcpAuthInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /authenticate/i }));
    await waitFor(() => {
      expect(screen.getByText(/connect failed/i)).toBeInTheDocument();
    });
  });

  it('shows Continue button after mcp_oauth_done postMessage + connected status', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ connected: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<InterruptBanner interrupt={mcpAuthInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />);

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'mcp_oauth_done', mcp_name: 'github' },
        origin: window.location.origin,
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    });
  });

  it('ignores mcp_oauth_done postMessage from a different origin', async () => {
    render(<InterruptBanner interrupt={mcpAuthInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />);

    // Fire the same message type but from an untrusted origin
    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'mcp_oauth_done', mcp_name: 'github' },
        origin: 'https://evil.example.com',
      }),
    );

    // Continue button must NOT appear — cross-origin message must be ignored
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument();
  });

  it('accepts mcp_oauth_done from the OAuth provider origin after Authenticate', async () => {
    vi.mocked(open).mockReturnValue(window);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ authorize_url: 'https://oauth.example.com/auth' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValue(
        new Response(JSON.stringify({ connected: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    render(<InterruptBanner interrupt={mcpAuthInterrupt} onResume={vi.fn()} onDismiss={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /authenticate/i }));
    await waitFor(() => expect(vi.mocked(open)).toHaveBeenCalled());
    expect(screen.queryByText(/popup blocked by browser/i)).not.toBeInTheDocument();

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'mcp_oauth_done', mcp_name: 'github' },
        origin: 'https://oauth.example.com',
      }),
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
    });
  });

  it('calls onResume("continue") when Continue is clicked', async () => {
    const onResume = vi.fn();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ connected: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    render(<InterruptBanner interrupt={mcpAuthInterrupt} onResume={onResume} onDismiss={vi.fn()} />);

    fireEvent(
      window,
      new MessageEvent('message', {
        data: { type: 'mcp_oauth_done', mcp_name: 'github' },
        origin: window.location.origin,
      }),
    );

    await waitFor(() => screen.getByRole('button', { name: /continue/i }));
    await userEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(onResume).toHaveBeenCalledWith('continue');
  });
});
