import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useInterruptApprovals } from '../hooks/useInterruptApprovals';
import { ToolApprovalControls } from './ToolApprovalControls';

function ApprovalHarness({ interrupt, disabled, onResume, onAlwaysAllow }: any) {
  const approvals = useInterruptApprovals([interrupt], disabled, onResume, onAlwaysAllow);
  return <>{approvals.map(approval => <div key={approval.key} data-action-index={approval.actionIndex}><ToolApprovalControls approval={approval}/></div>)}</>;
}

const interrupt = { id: 'group-a', resumable: true, value: {
  action_requests: [{ name: 'tool', args: { target: 'first' } }, { name: 'tool', args: { target: 'second' } }], review_configs: [],
} };

describe('interrupt approval decisions', () => {
  it('focuses Approve when the initial stream finishes and the controls become enabled', () => {
    const props = { interrupt: { ...interrupt, value: { ...interrupt.value,
      action_requests: [interrupt.value.action_requests[0]],
    } }, onResume: vi.fn() };
    const { rerender } = render(<ApprovalHarness {...props} disabled />);
    const button = screen.getByRole('button', { name: /^Approve/ });
    expect(button).not.toHaveFocus();
    rerender(<ApprovalHarness {...props} disabled={false} />);
    expect(button).toHaveFocus();
  });

  it.each([
    ['Approve', { type: 'approve' }],
    ['Reject', { type: 'reject', message: 'User rejected this action.' }],
  ] as const)('submits %s with the owning interrupt ID', async (button, decision) => {
    const onResume = vi.fn();
    render(<ApprovalHarness
      interrupt={{ ...interrupt, value: { ...interrupt.value, action_requests: [interrupt.value.action_requests[0]] } }}
      disabled={false}
      onResume={onResume}
    />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${button}`) }));
    await waitFor(() => expect(onResume).toHaveBeenCalledExactlyOnceWith([decision], interrupt.id));
  });

  it.each([
    ['lookup_records', { query: 'example' }, 'lookup_records'],
    ['task', { subagent_type: 'researcher' }, 'researcher'],
  ])('always allows %s and submits its approval once', async (name, args, allowedName) => {
    const onResume = vi.fn();
    const onAlwaysAllow = vi.fn();
    render(<ApprovalHarness
      interrupt={{ ...interrupt, value: { ...interrupt.value, action_requests: [{ name, args }] } }}
      disabled={false}
      onResume={onResume}
      onAlwaysAllow={onAlwaysAllow}
    />);
    fireEvent.click(screen.getByRole('button', { name: /^Always allow/ }));
    expect(onAlwaysAllow).toHaveBeenCalledExactlyOnceWith([allowedName]);
    await waitFor(() => expect(onResume).toHaveBeenCalledExactlyOnceWith([{ type: 'approve' }], interrupt.id));
  });

  it('keeps action ordering and the owning ID when decisions are made out of order', () => {
    const onResume = vi.fn();
    const { container } = render(<ApprovalHarness interrupt={interrupt} disabled={false} onResume={onResume} />);
    fireEvent.click(within(container.querySelector('[data-action-index="1"]') as HTMLElement).getByRole('button', { name: /^Reject/ }));
    expect(onResume).not.toHaveBeenCalled();
    fireEvent.click(within(container.querySelector('[data-action-index="0"]') as HTMLElement).getByRole('button', { name: /^Approve/ }));
    expect(onResume).toHaveBeenCalledWith([{ type: 'approve' }, { type: 'reject', message: 'User rejected this action.' }], 'group-a');
  });

  it('restores controls after a preflight rejection without a shared busy transition', async () => {
    const onResume = vi.fn().mockRejectedValueOnce(new Error('Wait for stream EOF')).mockResolvedValue(undefined);
    render(<ApprovalHarness interrupt={interrupt} disabled={false} onResume={onResume} />);
    screen.getAllByRole('button', { name: /^Approve/ }).forEach(button => fireEvent.click(button));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Approve/ })).toHaveLength(2));
    screen.getAllByRole('button', { name: /^Approve/ }).forEach(button => fireEvent.click(button));
    expect(onResume).toHaveBeenCalledTimes(2);
  });
});
