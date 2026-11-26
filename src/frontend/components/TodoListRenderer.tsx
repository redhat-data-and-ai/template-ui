import { List, ListItem, Spinner } from "@patternfly/react-core";
import { BanIcon, CheckCircleIcon, OutlinedCircleIcon, TasksIcon } from "@patternfly/react-icons";
import type { TodoItem } from "./todo-utils";
import "./progress.css";

const statusIcon: Record<TodoItem["status"], React.ReactNode> = {
  pending: <OutlinedCircleIcon color="var(--pf-t--global--icon--color--subtle)" />,
  in_progress: <Spinner size="sm" aria-label="In progress" />,
  completed: <CheckCircleIcon color="var(--pf-t--global--icon--color--status--success--default)" />,
  cancelled: <BanIcon color="var(--pf-t--global--icon--color--subtle)" />,
};

interface TodoListRendererProps {
  todos: TodoItem[];
  strikeAll?: boolean;
}

export function TodoListRenderer({ todos, strikeAll = false }: TodoListRendererProps) {
  if (todos.length === 0) return null;

  const completed = todos.filter(t => t.status === "completed").length;

  return (
    <div className="app-todos app-todos--box">
      <div className="app-todos__header">
        <TasksIcon aria-hidden="true" />
        <span className="app-todos__title">Tasks</span>
        <span className="app-todos__count">{completed}/{todos.length}</span>
      </div>
      <List isPlain className="app-todos__list">
        {todos.map((todo, idx) => {
          // When strikeAll is true, only show icons for completed/cancelled items
          const showIcon = !strikeAll || todo.status === "completed" || todo.status === "cancelled";
          const muted = strikeAll || todo.status === "completed" || todo.status === "cancelled";
          return (
            <ListItem
              key={`${idx}-${todo.content}`}
              icon={showIcon ? (statusIcon[todo.status] ?? statusIcon.pending) : <span className="app-todos__icon-gap" />}
            >
              <span className={`app-todos__item app-todos__item--${strikeAll ? "completed" : todo.status}${muted ? " app-todos__item--struck" : ""}`}>
                {todo.content}
              </span>
            </ListItem>
          );
        })}
      </List>
    </div>
  );
}
