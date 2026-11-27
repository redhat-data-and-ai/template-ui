import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EvalDatasetTable } from '../EvalDatasetTable';
import type { TestCase } from '../eval-dataset-types';

const makeCase = (overrides: Partial<TestCase> = {}): TestCase => ({
  id: 'case-1',
  name: 'test_case',
  description: 'A test case',
  tag: 'non_hitl',
  turns: [
    {
      id: 'turn-1',
      userMessage: 'Hello',
      expectedResponse: 'Hi',
      expectedIntent: '',
      expectedKeywords: [],
      toolCallEnabled: false,
      toolCallOrdered: false,
      expectedToolCalls: [],
    },
  ],
  createdAt: '2026-08-20T00:00:00.000Z',
  ...overrides,
});

describe('EvalDatasetTable', () => {
  it('renders empty state when no cases', () => {
    render(<EvalDatasetTable cases={[]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/No test cases yet/)).toBeInTheDocument();
  });

  it('renders case name, description, and tag', () => {
    render(<EvalDatasetTable cases={[makeCase()]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('test_case')).toBeInTheDocument();
    expect(screen.getByText('A test case')).toBeInTheDocument();
    expect(screen.getByText('non_hitl')).toBeInTheDocument();
  });

  it('does not call onDelete when trash icon is first clicked', () => {
    const onDelete = vi.fn();
    render(<EvalDatasetTable cases={[makeCase()]} onEdit={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('shows confirm and cancel buttons after trash click', () => {
    render(<EvalDatasetTable cases={[makeCase()]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    // Trash icon itself is gone
    expect(screen.queryByTitle('Delete')).not.toBeInTheDocument();
  });

  it('calls onDelete with the correct id when confirm is clicked', () => {
    const onDelete = vi.fn();
    render(<EvalDatasetTable cases={[makeCase({ id: 'abc-123' })]} onEdit={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith('abc-123');
  });

  it('restores the trash icon when Cancel is clicked', () => {
    render(<EvalDatasetTable cases={[makeCase()]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    // Cancel button gone, trash icon restored
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
  });

  it('does not call onDelete when Cancel is clicked', () => {
    const onDelete = vi.fn();
    render(<EvalDatasetTable cases={[makeCase()]} onEdit={vi.fn()} onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Delete'));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('calls onEdit with the correct id when edit icon is clicked', () => {
    const onEdit = vi.fn();
    render(<EvalDatasetTable cases={[makeCase({ id: 'xyz-999' })]} onEdit={onEdit} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(onEdit).toHaveBeenCalledWith('xyz-999');
  });

  it('shows tool_use badge when a turn has tool calls enabled', () => {
    const tc = makeCase({
      turns: [
        {
          id: 'turn-1',
          userMessage: 'call a tool',
          expectedResponse: 'done',
          expectedIntent: '',
          expectedKeywords: [],
          toolCallEnabled: true,
          toolCallOrdered: false,
          expectedToolCalls: [{ toolName: 'calc', arguments: [] }],
        },
      ],
    });
    render(<EvalDatasetTable cases={[tc]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText('tool_use')).toBeInTheDocument();
  });

  it('does not show tool_use badge when toolCallEnabled is false', () => {
    render(<EvalDatasetTable cases={[makeCase()]} onEdit={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.queryByText('tool_use')).not.toBeInTheDocument();
  });

  it('isolates pending delete to the clicked row — other rows keep trash icon', () => {
    const cases = [
      makeCase({ id: 'row-1', name: 'first_case' }),
      makeCase({ id: 'row-2', name: 'second_case' }),
    ];
    render(<EvalDatasetTable cases={cases} onEdit={vi.fn()} onDelete={vi.fn()} />);
    const trashButtons = screen.getAllByTitle('Delete');
    fireEvent.click(trashButtons[0]);
    // Second row still shows the trash icon
    expect(screen.getByTitle('Delete')).toBeInTheDocument();
    // First row shows confirm/cancel
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });
});
