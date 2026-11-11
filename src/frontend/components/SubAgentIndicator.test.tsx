import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SubAgentIndicator } from './SubAgentIndicator';

const runningAnalyst = {
  id: 'tc-1',
  name: 'task',
  args: { subagent_type: 'analyst', description: 'Get height and weight' },
};

describe('SubAgentIndicator question', () => {
  it('shows a question inside the running subagent card', () => {
    render(
      <SubAgentIndicator
        toolCall={runningAnalyst}
        messageId="msg-1"
        index={0}
        question={<p>What is your height?</p>}
      />,
    );

    expect(screen.getByText('What is your height?')).toBeInTheDocument();
    expect(screen.queryByText(/sub-agent is processing/i)).not.toBeInTheDocument();
  });
});

describe('SubAgentIndicator transcript', () => {
  const transcript = [{
    id: 'sub-1',
    thinking: 'Let me check',
    content: 'Top accounts\n\n| Name | Total |\n| --- | --- |\n| Acme | 4 |',
    tool_calls: [{ id: 'inner-1', name: 'get_sql', args: { query: 'orders' } }],
  }];

  it('shows a thought, the stream, and a tool while the subagent is working', () => {
    render(
      <SubAgentIndicator
        toolCall={{ ...runningAnalyst, transcript }}
        messageId="msg-1"
        index={0}
      />,
    );

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
    expect(screen.queryByText('Top accounts')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stream' }));
    expect(screen.getByText('Let me check')).toBeInTheDocument();
    expect(screen.getByText('Top accounts')).toBeInTheDocument();
    expect(screen.getByText('Use the orders table.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /expand tool call: get_sql/i })).toBeInTheDocument();
  });

  it('closes the whole stream when Streaming is clicked', async () => {
    render(
      <SubAgentIndicator
        toolCall={{ ...runningAnalyst, transcript }}
        messageId="msg-1"
        index={0}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: 'Streaming...' }));

    expect(screen.getByRole('button', { name: 'Stream' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Let me check')).not.toBeInTheDocument();
    expect(screen.queryByText('Top accounts')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expand tool call: get_sql/i })).not.toBeInTheDocument();
  });
});
