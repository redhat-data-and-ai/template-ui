import { useMemo } from 'react';
import type { Message } from '@langchain/langgraph-sdk';
import { CheckCircle, Circle, Loader2, ListChecks } from 'lucide-react';
import { extractTodosFromMessages, type TodoItem } from '../types/deep-agent';

interface TodoStripProps {
  readonly messages: Message[];
  readonly isLoading?: boolean;
}

const STATUS_CONFIG: Record<TodoItem['status'], { icon: typeof CheckCircle; className: string; iconClass: string }> = {
  completed: { icon: CheckCircle, className: 'text-green-700 dark:text-green-400', iconClass: 'text-green-600 dark:text-green-400' },
  in_progress: { icon: Loader2, className: 'text-foreground font-medium', iconClass: 'text-primary animate-spin' },
  pending: { icon: Circle, className: 'text-muted-foreground', iconClass: 'text-muted-foreground/50' },
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
    <div className="border-t border-border bg-card/60 backdrop-blur-sm" role="region" aria-label="Current tasks">
      <div className="max-w-3xl mx-auto px-4 py-2">
        <div className="flex items-center gap-2 mb-1.5">
          <ListChecks className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Tasks
          </span>
          <span className="text-[11px] text-muted-foreground ml-auto">
            {done}/{todos.length}
          </span>
        </div>
        <ul className="space-y-0.5">
          {todos.map((todo) => {
            const cfg = STATUS_CONFIG[todo.status];
            const Icon = cfg.icon;
            return (
              <li key={`${todo.status}-${todo.content}`} className="flex items-start gap-2 py-0.5">
                <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${cfg.iconClass}`} />
                <span className={`text-xs leading-snug ${cfg.className}`}>
                  {todo.content}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
