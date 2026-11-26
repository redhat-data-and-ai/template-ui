import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

describe('SubAgentIndicator transcript', () => {
  const runningAnalyst = {
    id: 'tc-1',
    name: 'task',
    args: { subagent_type: 'analyst', description: 'Get height and weight' },
  };
  const transcript = [{
    id: 'sub-1',
    thinking: 'Let me check',
    content: 'Top accounts\n\n| Name | Total |\n| --- | --- |\n| Acme | 4 |',
    tool_calls: [{ id: 'inner-1', name: 'get_sql', args: { query: 'orders' } }],
  }];

  it('shows a thought, the stream, and a tool while the subagent is working', () => {
    render(<SubAgentIndicator toolCall={{ ...runningAnalyst, transcript }} messageId="msg-1" index={0} />);

    const thought = screen.getByText('Let me check');
    const stream = screen.getByText('Top accounts');
    expect(thought.closest('div')?.className).toContain('italic');
    expect(thought.closest('div')?.className).toContain('text-[12px]');
    expect(stream.closest('div')?.className).not.toContain('italic');
    expect(stream.closest('div')?.className).toContain('text-[13px]');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expand tool call: get_sql/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Streaming...' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /analyst/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('starts closed after the result arrives and shows the transcript when opened', async () => {
    render(
      <SubAgentIndicator
        toolCall={{ ...runningAnalyst, content: 'Use the orders table.', transcript }}
        messageId="msg-1"
        index={0}
      />,
    );

    const header = screen.getByRole('button', { name: /analyst/i });
    expect(header).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Let me check')).not.toBeInTheDocument();

    await userEvent.click(header);
    expect(screen.queryByText('Let me check')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stream' }));
    expect(screen.getByText('Let me check')).toBeInTheDocument();
    expect(screen.getByText('Top accounts')).toBeInTheDocument();
    expect(screen.getByText('Use the orders table.')).toBeInTheDocument();
  });

  it('closes the whole stream when Streaming is clicked', async () => {
    render(<SubAgentIndicator toolCall={{ ...runningAnalyst, transcript }} messageId="msg-1" index={0} />);
    await userEvent.click(screen.getByRole('button', { name: 'Streaming...' }));
    expect(screen.getByRole('button', { name: 'Stream' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Let me check')).not.toBeInTheDocument();
  });
});
