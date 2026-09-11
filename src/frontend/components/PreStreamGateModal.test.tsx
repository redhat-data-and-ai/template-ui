import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreStreamGateModal } from './PreStreamGateModal';
import type { McpOAuthConnection } from '../services/mcp-oauth-api';

const disconnected: McpOAuthConnection = {
  mcp_name: 'jira-mcp',
  auth_mode: 'dcr',
  description: 'Jira',
  connected: false,
};

const defaultProps = {
  isOpen: true,
  autoApproveAllTools: false,
  unauthenticated: [] as McpOAuthConnection[],
  ready: false,
  loadError: null as string | null,
  busyMcp: null as string | null,
  onToggleAutoApprove: vi.fn(),
  onAuthenticate: vi.fn(),
  onRetry: vi.fn(),
  onContinue: vi.fn(),
  onCancel: vi.fn(),
};

describe('PreStreamGateModal', () => {
  it('disables Continue until ready and Cancel calls onCancel', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<PreStreamGateModal {...defaultProps} onCancel={onCancel} />);

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('enables Continue when ready', async () => {
    const user = userEvent.setup();
    const onContinue = vi.fn();
    render(
      <PreStreamGateModal
        {...defaultProps}
        autoApproveAllTools
        ready
        onContinue={onContinue}
      />,
    );

    const continueButton = screen.getByRole('button', { name: 'Continue' });
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);
    expect(onContinue).toHaveBeenCalled();
  });

  it('lists unauthenticated MCPs with Authenticate actions', async () => {
    const user = userEvent.setup();
    const onAuthenticate = vi.fn();
    render(
      <PreStreamGateModal
        {...defaultProps}
        unauthenticated={[disconnected]}
        onAuthenticate={onAuthenticate}
      />,
    );

    expect(screen.getByText('Jira')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /authenticate jira/i }));
    expect(onAuthenticate).toHaveBeenCalledWith('jira-mcp');
  });

  it('shows a retry action when loading failed', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <PreStreamGateModal
        {...defaultProps}
        loadError="agent down"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText('agent down')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('keeps the auto-approve switch visible when auto-approve is already on', () => {
    render(
      <PreStreamGateModal
        {...defaultProps}
        autoApproveAllTools
        ready
      />,
    );

    expect(screen.getByRole('switch', { name: /auto-approve all tools/i })).toBeChecked();
  });
});
