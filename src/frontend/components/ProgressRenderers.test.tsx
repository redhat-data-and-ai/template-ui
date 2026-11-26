import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Message } from '@langchain/langgraph-sdk';
import { TaskProgressStepper } from './TaskProgressStepper';
import { TasksSidebar } from './TasksSidebar';
import { TodoStrip } from './TodoStrip';
import { TodoListRenderer } from './TodoListRenderer';
import { ActivityTimeline } from './ActivityTimeline';

const messages = [
  { type: 'ai', id: 'a1', content: '', tool_calls: [
    { id: 't1', name: 'search_web', args: {} },
    { id: 't2', name: 'task', args: { subagent_type: 'researcher' } },
    { id: 't3', name: 'write_file', args: {} },
  ] },
  { type: 'tool', id: 'r1', tool_call_id: 't1', content: 'found things' },
  { type: 'tool', id: 'r2', tool_call_id: 't2', content: 'Research complete' },
] as unknown as Message[];

describe('TaskProgressStepper', () => {
  it('renders one step per tool call, skipping write_todos', () => {
    const withTodos = [
      { type: 'ai', id: 'x', content: '', tool_calls: [{ id: 'w', name: 'write_todos', args: {} }] },
      ...messages,
    ] as unknown as Message[];
    render(<TaskProgressStepper messages={withTodos} isLoading />);
    expect(screen.getByText('search_web')).toBeVisible();
    expect(screen.getByText('researcher')).toBeVisible();
    expect(screen.getByText('write_file')).toBeVisible();
    expect(screen.queryByText('write_todos')).not.toBeInTheDocument();
    expect(screen.queryByText('Processing')).not.toBeInTheDocument();
  });

  it('shows Processing once every step is done while loading, and renders nothing with no steps', () => {
    const done = messages.concat([{ type: 'tool', id: 'r3', tool_call_id: 't3', content: 'ok' }] as unknown as Message[]);
    render(<TaskProgressStepper messages={done} isLoading />);
    expect(screen.getByText('Processing')).toBeVisible();
  });

  it('renders nothing without tool calls', () => {
    const { container } = render(<TaskProgressStepper messages={[]} isLoading={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('TasksSidebar', () => {
  it('lists tool calls with a completed count and previews', () => {
    render(<TasksSidebar messages={messages} isLoading />);
    expect(screen.getByText('Tasks & Tools')).toBeVisible();
    expect(screen.getByText('2/3')).toBeVisible();
    expect(screen.getByText('found things')).toBeVisible();
    expect(screen.getByText('write_file')).toBeVisible();
  });

  it('waits for tasks while loading with none, and hides when idle', () => {
    const { container, rerender } = render(<TasksSidebar messages={[]} isLoading />);
    expect(screen.getByText('Waiting for tasks...')).toBeVisible();
    rerender(<TasksSidebar messages={[]} isLoading={false} />);
    expect(container).toBeEmptyDOMElement();
  });
});

const todoMsgs = [{ type: 'ai', id: 'td', content: '', tool_calls: [{ id: 'w', name: 'write_todos', args: { todos: [
  { content: 'Plan', status: 'completed' }, { content: 'Build', status: 'in_progress' }, { content: 'Ship', status: 'pending' },
] } }] }] as unknown as Message[];

describe('TodoStrip', () => {
  it('shows the todos with a done count while loading', () => {
    render(<TodoStrip messages={todoMsgs} isLoading />);
    const region = screen.getByRole('region', { name: 'Current tasks' });
    expect(region).toHaveTextContent('1/3');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Build')).toBeVisible();
  });
  it('marks everything complete once loading ends', () => {
    render(<TodoStrip messages={todoMsgs} isLoading={false} />);
    expect(screen.getByRole('region', { name: 'Current tasks' })).toHaveTextContent('3/3');
  });
});

describe('TodoListRenderer', () => {
  it('renders items and the completed count; nothing when empty', () => {
    const { container, rerender } = render(<TodoListRenderer todos={[
      { content: 'One', status: 'completed' }, { content: 'Two', status: 'pending' },
    ]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('1/2')).toBeVisible();
    rerender(<TodoListRenderer todos={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('ActivityTimeline', () => {
  const events = [{ title: 'Generating Search Queries', data: ['a', 'b'] }, { title: 'Research', data: 'done' }];
  it('lists events while loading and collapses when finished, toggling on click', () => {
    const { rerender } = render(<ActivityTimeline processedEvents={events} isLoading />);
    expect(screen.getByText('Generating Search Queries')).toBeVisible();
    expect(screen.getByText('a, b')).toBeVisible();
    rerender(<ActivityTimeline processedEvents={events} isLoading={false} />);
    expect(screen.getByText('Generating Search Queries')).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Research' }));
    expect(screen.getByText('Generating Search Queries')).toBeVisible();
  });
  it('shows an empty state when idle with no events', () => {
    render(<ActivityTimeline processedEvents={[]} isLoading={false} />);
    expect(screen.getByText('No activity to display.')).toBeVisible();
  });
});

describe('TaskProgressStepper strip', () => {
  it('uses a strip that never scrolls vertically', () => {
    render(<TaskProgressStepper messages={messages} isLoading />);
    expect(screen.getByRole('region', { name: 'Task progress' })).toHaveClass('app-task-strip');
  });
});
