import { useMemo } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { List, ListItem, Spinner } from '@patternfly/react-core';
import { CheckCircleIcon, OutlinedCircleIcon, TasksIcon } from '@patternfly/react-icons';
import './progress.css';
import { extractTodosFromMessages, type TodoItem } from '../types/deep-agent';

interface TodoStripProps {
  readonly messages: Message[];
  readonly isLoading?: boolean;
}

const STATUS_ICON: Record<TodoItem['status'], React.ReactNode> = {
  completed: <CheckCircleIcon color="var(--pf-t--global--icon--color--status--success--default)" />,
  in_progress: <Spinner size="sm" aria-label="In progress" />,
  pending: <OutlinedCircleIcon color="var(--pf-t--global--icon--color--subtle)" />,
};

export function TodoStrip({ messages, isLoading = false }: TodoStripProps) {
  const rawTodos = useMemo(() => extractTodosFromMessages(messages), [messages]);

  const todos = useMemo(() => {
    if (isLoading) return rawTodos;
    return rawTodos.map((t) =>
      t.status === 'in_progress' || t.status === 'pending'
        ? { ...t, status: 'completed' as const }
        : t,
    );
  }, [rawTodos, isLoading]);

  if (todos.length === 0) return null;

  const done = todos.filter((t) => t.status === 'completed').length;

  return (
    <div className="app-todos app-todos--strip" role="region" aria-label="Current tasks">
      <div className="app-todos__inner">
        <div className="app-todos__header">
          <TasksIcon aria-hidden="true" />
          <span className="app-todos__title">Tasks</span>
          <span className="app-todos__count">{done}/{todos.length}</span>
        </div>
        <List isPlain className="app-todos__list">
          {todos.map((todo) => (
            <ListItem key={`${todo.status}-${todo.content}`} icon={STATUS_ICON[todo.status]}>
              <span className={`app-todos__item app-todos__item--${todo.status}`}>{todo.content}</span>
            </ListItem>
          ))}
        </List>
      </div>
    </div>
  );
}
