import type { Message } from '@langchain/langgraph-sdk';
import { Label } from '@patternfly/react-core';
import { CheckCircle, Circle, Loader2 } from 'lucide-react';
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

  return (
    <div className="flex items-center gap-1.5 px-4 py-2 overflow-x-auto">
      {steps.map((step, idx) => {
        const StatusIcon = step.status === 'complete' ? CheckCircle
          : step.status === 'running' ? Loader2
          : Circle;

        return (
          <div key={step.id} className="flex items-center gap-1.5 shrink-0">
            {idx > 0 && (
              <div className={`w-4 h-px ${step.status === 'complete' ? 'bg-green-500/50' : 'bg-border'}`} />
            )}
            <Label
              isCompact
              color={step.status === 'complete' ? 'green' : 'blue'}
              icon={
                <StatusIcon
                  className={`w-2.5 h-2.5 ${step.status === 'running' ? 'animate-spin' : ''}`}
                />
              }
            >
              <span className={step.isSubAgent ? 'capitalize font-medium' : ''}>
                {step.name}
              </span>
            </Label>
          </div>
        );
      })}
      {isLoading && steps.every((s) => s.status === 'complete') && (
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-4 h-px bg-border" />
          <Label isCompact color="blue" icon={<Loader2 className="w-2.5 h-2.5 animate-spin" />}>
            Processing
          </Label>
        </div>
      )}
    </div>
  );
}
