import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConversationDetailTable } from '../ConversationDetailTable';
import type { Turn } from '../eval-types';

const makeTurn = (overrides: Partial<Turn> = {}): Turn => ({
  conversation_group_id: 'conv_abc',
  metric_identifier: 'custom:answer_correctness',
  result: 'PASS',
  score: '0.95',
  reason: 'Looks good',
  tag: 'hitl',
  ...overrides,
});

describe('ConversationDetailTable', () => {
  it('renders nothing when turns is empty', () => {
    const { container } = render(<ConversationDetailTable turns={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render tag chips when availableTags is empty', () => {
    render(<ConversationDetailTable turns={[makeTurn()]} availableTags={[]} />);
    expect(screen.queryByText('All')).not.toBeInTheDocument();
  });

  it('renders tag chips when availableTags has entries', () => {
    render(
      <ConversationDetailTable
        turns={[makeTurn()]}
        availableTags={['hitl', 'tool_use']}
        activeTag="all"
        onTagChange={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hitl' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tool Use' })).toBeInTheDocument();
  });

  it('calls onTagChange when a chip is clicked', () => {
    const onTagChange = vi.fn();
    render(
      <ConversationDetailTable
        turns={[makeTurn()]}
        availableTags={['hitl']}
        activeTag="all"
        onTagChange={onTagChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Hitl' }));
    expect(onTagChange).toHaveBeenCalledWith('hitl');
  });

  it('hides conversations whose tag does not match activeTag', () => {
    const turns: Turn[] = [
      makeTurn({ conversation_group_id: 'conv_1', tag: 'hitl' }),
      makeTurn({ conversation_group_id: 'conv_2', tag: 'tool_use' }),
    ];
    render(
      <ConversationDetailTable
        turns={turns}
        availableTags={['hitl', 'tool_use']}
        activeTag="hitl"
        onTagChange={() => {}}
      />
    );
    // conv_1 visible (tag matches), conv_2 hidden
    // use role selector because the badge appends tag text to the header span
    expect(screen.getByRole('button', { name: /Conv 1/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conv 2/ })).not.toBeInTheDocument();
  });

  it('shows all conversations when activeTag is "all"', () => {
    const turns: Turn[] = [
      makeTurn({ conversation_group_id: 'conv_1', tag: 'hitl' }),
      makeTurn({ conversation_group_id: 'conv_2', tag: 'tool_use' }),
    ];
    render(
      <ConversationDetailTable
        turns={turns}
        availableTags={['hitl', 'tool_use']}
        activeTag="all"
        onTagChange={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: /Conv 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Conv 2/ })).toBeInTheDocument();
  });
});
