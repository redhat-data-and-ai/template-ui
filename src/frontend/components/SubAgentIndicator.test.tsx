import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ToolApproval } from '../hooks/useInterruptApprovals';
import { SubAgentIndicator } from './SubAgentIndicator';

const toolCall = { id: 'task-call', name: 'task', args: { subagent_type: 'researcher' } };
const approval: ToolApproval = {
  key: 'approval', interruptId: 'interrupt', actionIndex: 0,
  request: { name: 'task', args: { subagent_type: 'researcher', target: '/tmp/report.txt' } },
  disabled: false, decision: null, decide: vi.fn(),
};

describe('SubAgentIndicator approval arguments', () => {
  it.each([undefined, 'Research a topic'])('shows the full request before controls with description %s', description => {
    const args = { ...approval.request.args, ...(description ? { description } : {}) };
    render(<SubAgentIndicator toolCall={toolCall} messageId="message" index={0}
      approval={{ ...approval, request: { ...approval.request, args } }} />);

    const details = screen.getByText(/"subagent_type": "researcher"/);
    expect(details).toBeVisible();
    expect(details.textContent).toBe(JSON.stringify(args, null, 2));
    const approve = screen.getByRole('button', { name: 'Approve tool call: task' });
    expect(details.compareDocumentPosition(approve) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // Approval details remain visible even if the delegation body is collapsed.
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(details).toBeVisible();
  });

  it('removes approval arguments after a decision and when the approval is cleared', () => {
    const props = { toolCall, messageId: 'message', index: 0 };
    const { rerender } = render(<SubAgentIndicator {...props} approval={approval} />);
    expect(screen.getByText('Arguments')).toBeVisible();
    rerender(<SubAgentIndicator {...props} approval={{ ...approval, decision: { type: 'approve' } }} />);
    expect(screen.queryByText('Arguments')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve tool call: task' })).not.toBeInTheDocument();
    rerender(<SubAgentIndicator {...props} />);
    expect(screen.queryByText('Arguments')).not.toBeInTheDocument();
  });

  it('omits the arguments section for an empty request', () => {
    render(<SubAgentIndicator toolCall={toolCall} messageId="message" index={0}
      approval={{ ...approval, request: { name: 'task', args: {} } }} />);
    expect(screen.queryByText('Arguments')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve tool call: task' })).toBeVisible();
  });
});
