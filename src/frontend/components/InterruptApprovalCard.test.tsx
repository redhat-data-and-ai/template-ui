import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InterruptApprovalCard } from './InterruptApprovalCard';

const interrupt = { id: 'group-a', resumable: true, value: {
  action_requests: [{ name: 'tool', args: { target: 'first' } }, { name: 'tool', args: { target: 'second' } }], review_configs: [],
} };

describe('InterruptApprovalCard', () => {
  it('keeps action ordering and the owning ID when decisions are made out of order', () => {
    const onResume = vi.fn();
    const { container } = render(<InterruptApprovalCard interrupt={interrupt} disabled={false} onResume={onResume} />);
    fireEvent.click(within(container.querySelector('[data-action-index="1"]') as HTMLElement).getByRole('button', { name: 'Reject', exact: true }));
    expect(onResume).not.toHaveBeenCalled();
    fireEvent.click(within(container.querySelector('[data-action-index="0"]') as HTMLElement).getByRole('button', { name: 'Approve', exact: true }));
    expect(onResume).toHaveBeenCalledWith([{ type: 'approve' }, { type: 'reject', message: 'User rejected this action.' }], 'group-a');
  });

  it('restores controls after a preflight rejection without a shared busy transition', async () => {
    const onResume = vi.fn().mockRejectedValueOnce(new Error('Wait for stream EOF')).mockResolvedValue(undefined);
    render(<InterruptApprovalCard interrupt={interrupt} disabled={false} onResume={onResume} />);
    screen.getAllByRole('button', { name: 'Approve', exact: true }).forEach(button => fireEvent.click(button));
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Approve', exact: true })).toHaveLength(2));
    screen.getAllByRole('button', { name: 'Approve', exact: true }).forEach(button => fireEvent.click(button));
    expect(onResume).toHaveBeenCalledTimes(2);
  });
});
