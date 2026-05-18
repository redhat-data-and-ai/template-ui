import { CheckCircle, Circle, Loader2, XCircle, ListTodo } from "lucide-react";
import { cn } from "../lib/utils";

export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed" | "cancelled";
}

const TOOL_NAME = "write_todos";

export function isWriteTodosCall(toolCall: { name: string }): boolean {
  return toolCall.name === TOOL_NAME;
}

export function isWriteTodosResult(message: { type: string; name?: string }): boolean {
  return message.type === 'tool' && message.name === TOOL_NAME;
}

function isValidTodoItem(item: unknown): item is TodoItem {
  return (
    typeof item === 'object' &&
    item !== null &&
    typeof (item as any).content === 'string' &&
    typeof (item as any).status === 'string'
  );
}

export function extractTodos(toolCall: { args: Record<string, unknown> }): TodoItem[] {
  const args = toolCall.args as Record<string, unknown>;
  if (Array.isArray(args?.todos)) {
    return args.todos.filter(isValidTodoItem);
  }
  return [];
}

const statusIcon: Record<TodoItem["status"], React.ReactNode> = {
  pending: <Circle className="w-4 h-4 text-neutral-500 shrink-0" />,
  in_progress: <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />,
  completed: <CheckCircle className="w-4 h-4 text-green-400 shrink-0" />,
  cancelled: <XCircle className="w-4 h-4 text-neutral-600 shrink-0" />,
};

interface TodoListRendererProps {
  todos: TodoItem[];
  strikeAll?: boolean;
}

export function TodoListRenderer({ todos, strikeAll = false }: TodoListRendererProps) {
  if (todos.length === 0) return null;

  const completed = todos.filter(t => t.status === "completed").length;

  return (
    <div className="rounded-lg border border-neutral-700/40 bg-neutral-800/40 overflow-hidden w-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-neutral-700/30 bg-neutral-800/60">
        <ListTodo className="w-4 h-4 text-neutral-400" />
        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
          Tasks
        </span>
        <span className="ml-auto text-xs text-neutral-500">
          {completed}/{todos.length}
        </span>
      </div>
      <ul className="divide-y divide-neutral-700/20">
        {todos.map((todo, idx) => {
          // When strikeAll is true, only show icons for completed/cancelled items
          const showIcon = !strikeAll || todo.status === "completed" || todo.status === "cancelled";

          return (
            <li
              key={`${idx}-${todo.content}`}
              className={cn(
                "flex items-start gap-2.5 px-3 py-2 text-sm transition-opacity",
                (strikeAll || todo.status === "completed" || todo.status === "cancelled") && "opacity-60",
              )}
            >
              {showIcon ? (
                statusIcon[todo.status] ?? <Circle className="w-4 h-4 text-neutral-500 shrink-0" />
              ) : (
                <span className="w-4 h-4 shrink-0" />
              )}
              <span
                className={cn(
                  "leading-5",
                  strikeAll && "line-through text-neutral-500",
                  !strikeAll && todo.status === "completed" && "line-through text-neutral-500",
                  !strikeAll && todo.status === "cancelled" && "line-through text-neutral-600",
                  !strikeAll && todo.status === "in_progress" && "text-blue-100",
                  !strikeAll && todo.status === "pending" && "text-neutral-300",
                )}
              >
                {todo.content}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
