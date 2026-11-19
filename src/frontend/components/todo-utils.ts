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
