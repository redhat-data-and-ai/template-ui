import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, render, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyboardShortcutsDialog } from './KeyboardShortcutsDialog';
import { SessionExpiredModal } from './SessionExpiredModal';
import { ProjectEditModal } from './ProjectEditModal';
import { DebugPanel } from './DebugPanel';
import { DebugToggle } from './DebugToggle';
import { ChatErrorBoundary } from './ChatErrorBoundary';
import { renderWithProviders } from '../test-utils/render';

describe('KeyboardShortcutsDialog', () => {
  it('lists shortcuts in a table and closes', async () => {
    const onClose = vi.fn();
    render(<KeyboardShortcutsDialog isOpen onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: /keyboard shortcuts/i });
    expect(within(dialog).getByRole('columnheader', { name: 'Shortcut' })).toBeInTheDocument();
    expect(within(dialog).getByRole('cell', { name: 'Focus chat input' })).toBeInTheDocument();
    expect(within(dialog).getByRole('cell', { name: 'Show this dialog' })).toBeInTheDocument();
    await userEvent.click(within(dialog).getAllByRole('button', { name: 'Close' })[0]);
    expect(onClose).toHaveBeenCalled();
  });
});

describe('SessionExpiredModal', () => {
  it('offers a log in action', () => {
    render(<SessionExpiredModal isOpen />);
    const dialog = screen.getByRole('dialog', { name: /session expired/i });
    expect(within(dialog).getByText(/your session has expired/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Log In' })).toBeInTheDocument();
  });
});

describe('ProjectEditModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('disables Save until a name is entered and saves trimmed values', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<ProjectEditModal isOpen onClose={onClose} onSave={onSave} />);
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    await userEvent.type(screen.getByRole('textbox', { name: /name/i }), '  Alpha ');
    await userEvent.type(screen.getByRole('textbox', { name: /description/i }), ' notes ');
    await userEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Alpha', 'notes'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows a duplicate-name error and stays open', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();
    render(<ProjectEditModal isOpen onClose={onClose} onSave={onSave} />);
    await userEvent.type(screen.getByRole('textbox', { name: /name/i }), 'Alpha{Enter}');
    expect((await screen.findByRole('alert')).textContent).toMatch(/already exists/);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('DebugPanel', () => {
  it('shows counts and streaming state', () => {
    const streamingState: any = {
      isLoading: false, isConnected: true, currentRunId: 'r1', activeSubAgent: null,
      pendingInterrupt: null, taskSteps: [],
    };
    render(
      <DebugPanel
        messages={[{ type: 'human', content: 'hi' }, { type: 'ai', content: 'yo', tool_calls: [{}] }] as any}
        streamingState={streamingState}
      />,
    );
    const list = screen.getByLabelText('Debug counts');
    expect(within(list).getByText("Messages").closest("div")).toHaveTextContent(/Messages\s*2/);
    expect(within(list).getByText("Tool Calls").closest("div")).toHaveTextContent(/Tool Calls\s*1/);
    expect(screen.getByText(/"runId": "r1"/)).toBeInTheDocument();
  });
});

describe('DebugToggle', () => {
  it('toggles debug mode', async () => {
    renderWithProviders(<DebugToggle />);
    await userEvent.click(screen.getByRole('button', { name: 'Enable debug mode' }));
    expect(screen.getByRole('button', { name: 'Disable debug mode' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('ChatErrorBoundary', () => {
  it('retries after an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let shouldThrow = true;
    function Boom() {
      if (shouldThrow) throw new Error('x');
      return <p>recovered</p>;
    }
    render(<ChatErrorBoundary><Boom /></ChatErrorBoundary>);
    expect(screen.getByText('Chat Error')).toBeInTheDocument();
    shouldThrow = false;
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(screen.getByText('recovered')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
