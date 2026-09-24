import type { Message } from '@langchain/langgraph-sdk';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Label,
} from '@patternfly/react-core';
import { Bot, CheckCircle, FileText, Loader2, Wrench } from 'lucide-react';
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

export function TasksSidebar({ messages, isLoading }: TasksSidebarProps) {
  const entries = extractEntries(messages);
  if (entries.length === 0 && !isLoading) return null;

  const completed = entries.filter((e) => e.hasResult).length;
  const total = entries.length;

  return (
    <Card isCompact className="h-full">
      <CardHeader>
        <CardTitle className="text-sm flex items-center justify-between w-full">
          <span>Tasks & Tools</span>
          {total > 0 && (
            <Label isCompact color={completed === total ? 'green' : 'blue'}>
              {completed}/{total}
            </Label>
          )}
        </CardTitle>
      </CardHeader>
      <CardBody className="overflow-y-auto space-y-1.5 pt-0!">
        {entries.map((entry) => {
          const Icon = entry.isSubAgent ? Bot : Wrench;
          const StatusIcon = entry.hasResult ? CheckCircle : Loader2;

          return (
            <div
              key={entry.id}
              className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`text-xs font-medium truncate ${entry.isSubAgent ? 'capitalize' : 'font-mono'}`}>
                    {entry.name}
                  </span>
                  <StatusIcon
                    className={`w-3 h-3 shrink-0 ${
                      entry.hasResult ? 'text-green-500' : 'text-blue-500 animate-spin'
                    }`}
                  />
                </div>
                {entry.resultPreview && (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                    {entry.resultPreview}
                  </p>
                )}
                {entry.resultKind && entry.resultKind !== 'text' && (
                  <div className="mt-0.5">
                    <Label isCompact color="grey">
                      <FileText className="w-2 h-2 mr-0.5" />
                      {entry.resultKind}
                    </Label>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {entries.length === 0 && isLoading && (
          <p className="text-xs text-muted-foreground text-center py-4">
            Waiting for tasks...
          </p>
        )}
      </CardBody>
    </Card>
  );
}
