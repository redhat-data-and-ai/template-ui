import type { Message } from '@langchain/langgraph-sdk';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
} from '@patternfly/react-core';
import type { StreamingState } from '../redux/slices/chats';

interface DebugPanelProps {
  readonly messages: Message[];
  readonly streamingState: StreamingState;
}

export function DebugPanel({ messages, streamingState }: DebugPanelProps) {
  const aiMessages = messages.filter((m) => m.type === 'ai');
  const toolMessages = messages.filter((m) => m.type === 'tool');
  const humanMessages = messages.filter((m) => m.type === 'human');

  const totalToolCalls = aiMessages.reduce((acc, m) => {
    const tcs = (m as any).tool_calls;
    return acc + (Array.isArray(tcs) ? tcs.length : 0);
  }, 0);

  return (
    <Card isCompact className="border-yellow-500/30 bg-yellow-500/5">
      <CardHeader>
        <CardTitle className="text-xs font-mono text-yellow-600 dark:text-yellow-400">
          Debug
        </CardTitle>
      </CardHeader>
      <CardBody className="!pt-0 space-y-2">
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-mono">
          <span className="text-muted-foreground">Messages</span>
          <span>{messages.length}</span>
          <span className="text-muted-foreground">Human</span>
          <span>{humanMessages.length}</span>
          <span className="text-muted-foreground">AI</span>
          <span>{aiMessages.length}</span>
          <span className="text-muted-foreground">Tool</span>
          <span>{toolMessages.length}</span>
          <span className="text-muted-foreground">Tool Calls</span>
          <span>{totalToolCalls}</span>
        </div>

        <div className="border-t border-border pt-2">
          <p className="text-[10px] font-mono text-muted-foreground mb-1">Streaming State</p>
          <pre className="text-[9px] font-mono text-foreground bg-muted p-2 rounded overflow-auto max-h-32">
            {JSON.stringify(
              {
                isLoading: streamingState.isLoading,
                isConnected: streamingState.isConnected,
                runId: streamingState.currentRunId,
                activeSubAgent: streamingState.activeSubAgent?.name ?? null,
                pendingInterrupt: streamingState.pendingInterrupt != null,
                taskSteps: streamingState.taskSteps.length,
              },
              null,
              2,
            )}
          </pre>
        </div>
      </CardBody>
    </Card>
  );
}
