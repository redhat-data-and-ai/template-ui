import type { Message } from '@langchain/langgraph-sdk';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Label,
  List,
  ListItem,
  Spinner,
} from '@patternfly/react-core';
import { CheckCircleIcon, FileAltIcon, RobotIcon, WrenchIcon } from '@patternfly/react-icons';
import './progress.css';
import { isSubAgentToolCall, extractSubAgentName, detectArtifactKind } from '../types/deep-agent';

interface TasksSidebarProps {
  readonly messages: Message[];
  readonly isLoading: boolean;
}

interface ToolCallEntry {
  id: string;
  name: string;
  isSubAgent: boolean;
  hasResult: boolean;
  resultPreview?: string;
  resultKind?: string;
}

function extractEntries(messages: Message[]): ToolCallEntry[] {
  const entries: ToolCallEntry[] = [];
  const resultMap = new Map<string, string>();

  for (const msg of messages) {
    if (msg.type === 'tool' && (msg as any).tool_call_id) {
      const content = typeof (msg as any).content === 'string'
        ? (msg as any).content
        : JSON.stringify((msg as any).content);
      resultMap.set((msg as any).tool_call_id, content);
    }
  }

  for (const msg of messages) {
    if (msg.type !== 'ai') continue;
    const toolCalls = (msg as any).tool_calls;
    if (!Array.isArray(toolCalls)) continue;

    for (const tc of toolCalls) {
      if (tc.name === 'write_todos') continue;
      const result = resultMap.get(tc.id) ?? (tc.content != null ? String(tc.content) : undefined);
      const subAgent = isSubAgentToolCall(tc);
      entries.push({
        id: tc.id ?? `tc-${entries.length}`,
        name: subAgent ? extractSubAgentName(tc) : tc.name,
        isSubAgent: subAgent,
        hasResult: result !== undefined,
        resultPreview: result ? result.substring(0, 80) + (result.length > 80 ? '...' : '') : undefined,
        resultKind: result ? detectArtifactKind(result) : undefined,
      });
    }
  }

  return entries;
}

/** True when TasksSidebar would render (tool-call entries exist, or a run is in flight). */
// eslint-disable-next-line react-refresh/only-export-components
export function hasTasksSidebarContent(messages: Message[], isLoading: boolean): boolean {
  return isLoading || extractEntries(messages).length > 0;
}

export function TasksSidebar({ messages, isLoading }: TasksSidebarProps) {
  const entries = extractEntries(messages);
  if (entries.length === 0 && !isLoading) return null;

  const completed = entries.filter((e) => e.hasResult).length;
  const total = entries.length;

  return (
    <Card isCompact className="app-tasks-sidebar">
      <CardHeader>
        <CardTitle>
          <span className="app-tasks-sidebar__title">
            <span>Tasks & Tools</span>
            {total > 0 && (
              <Label isCompact color={completed === total ? 'green' : 'blue'}>
                {completed}/{total}
              </Label>
            )}
          </span>
        </CardTitle>
      </CardHeader>
      <CardBody className="app-tasks-sidebar__body">
        {entries.length > 0 && (
          <List isPlain className="app-tasks-sidebar__list">
            {entries.map((entry) => (
              <ListItem
                key={entry.id}
                icon={entry.isSubAgent ? <RobotIcon /> : <WrenchIcon />}
              >
                <span className="app-tasks-sidebar__row">
                  <span className={`app-tasks-sidebar__name${entry.isSubAgent ? ' app-tasks-sidebar__name--agent' : ''}`}>
                    {entry.name}
                  </span>
                  {entry.hasResult
                    ? <CheckCircleIcon color="var(--pf-t--global--icon--color--status--success--default)" aria-label="Complete" />
                    : <Spinner size="sm" aria-label="Running" />}
                </span>
                {entry.resultPreview && (
                  <span className="app-tasks-sidebar__preview">{entry.resultPreview}</span>
                )}
                {entry.resultKind && entry.resultKind !== 'text' && (
                  <Label isCompact color="grey" icon={<FileAltIcon />}>
                    {entry.resultKind}
                  </Label>
                )}
              </ListItem>
            ))}
          </List>
        )}
        {entries.length === 0 && isLoading && (
          <p className="app-tasks-sidebar__empty">Waiting for tasks...</p>
        )}
      </CardBody>
    </Card>
  );
}
