import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
