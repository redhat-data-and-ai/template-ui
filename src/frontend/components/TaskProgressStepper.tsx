import type { Message } from '@langchain/langgraph-sdk';
import { Label, Spinner } from '@patternfly/react-core';
import { CheckCircleIcon } from '@patternfly/react-icons';
import './progress.css';
import { isSubAgentToolCall, extractSubAgentName } from '../types/deep-agent';

interface TaskProgressStepperProps {
  readonly messages: Message[];
  readonly isLoading: boolean;
}

interface DerivedStep {
  id: string;
  name: string;
  status: 'running' | 'complete';
  isSubAgent: boolean;
}

function deriveSteps(messages: Message[]): DerivedStep[] {
  const steps: DerivedStep[] = [];
  const completedToolCallIds = new Set<string>();

  for (const msg of messages) {
    if (msg.type === 'tool' && (msg as any).tool_call_id) {
      completedToolCallIds.add((msg as any).tool_call_id);
    }
  }

  for (const msg of messages) {
    if (msg.type !== 'ai') continue;
    const toolCalls = (msg as any).tool_calls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) continue;

    for (const tc of toolCalls) {
      if (tc.name === 'write_todos') continue;
      const subAgent = isSubAgentToolCall(tc);
      steps.push({
        id: tc.id ?? `step-${steps.length}`,
        name: subAgent ? extractSubAgentName(tc) : tc.name,
        status: completedToolCallIds.has(tc.id) || tc.content != null ? 'complete' : 'running',
        isSubAgent: subAgent,
      });
    }
  }

  return steps;
}

export function TaskProgressStepper({ messages, isLoading }: TaskProgressStepperProps) {
  const steps = deriveSteps(messages);
  if (steps.length === 0) return null;
  const showProcessing = isLoading && steps.every((s) => s.status === 'complete');

  const items = [
    ...steps.map((step) => ({
      key: step.id,
      name: step.name,
      status: step.status as 'complete' | 'running',
      isSubAgent: step.isSubAgent,
    })),
    ...(showProcessing
      ? [{ key: 'processing', name: 'Processing', status: 'running' as const, isSubAgent: false }]
      : []),
  ];

  return (
    <div className="app-task-strip" role="region" aria-label="Task progress">
      <div className="app-task-strip__row" role="list" aria-label="Task progress steps">
        {items.map((item, idx) => (
          <div key={item.key} className="app-task-strip__item" role="listitem">
            {idx > 0 && (
              <span
                aria-hidden="true"
                className={`app-task-strip__connector${items[idx - 1].status === 'complete' ? ' app-task-strip__connector--done' : ''}`}
              />
            )}
            <Label
              isCompact
              color={item.status === 'complete' ? 'green' : 'blue'}
              icon={item.status === 'complete' ? <CheckCircleIcon /> : <Spinner size="sm" aria-hidden="true" />}
            >
              <span className={item.isSubAgent ? 'app-task-strip__sub' : undefined}>{item.name}</span>
              <span className="pf-v6-screen-reader">{item.status === 'complete' ? ': complete' : ': running'}</span>
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
