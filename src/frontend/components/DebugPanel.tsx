import type { Message } from '@langchain/langgraph-sdk';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  CodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
} from '@patternfly/react-core';
import './dialogs.css';
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

  const stats: [string, number][] = [
    ['Messages', messages.length],
    ['Human', humanMessages.length],
    ['AI', aiMessages.length],
    ['Tool', toolMessages.length],
    ['Tool Calls', totalToolCalls],
  ];

  return (
    <Card isCompact className="app-debug">
      <CardHeader>
        <CardTitle className="app-debug__title">Debug</CardTitle>
      </CardHeader>
      <CardBody>
        <DescriptionList isCompact isHorizontal isFluid columnModifier={{ default: '1Col' }} aria-label="Debug counts">
          {stats.map(([term, value]) => (
            <DescriptionListGroup key={term}>
              <DescriptionListTerm>{term}</DescriptionListTerm>
              <DescriptionListDescription>{value}</DescriptionListDescription>
            </DescriptionListGroup>
          ))}
        </DescriptionList>

        <p className="app-debug__label">Streaming State</p>
        <CodeBlock>
          <CodeBlockCode>
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
          </CodeBlockCode>
        </CodeBlock>
      </CardBody>
    </Card>
  );
}
