import type { Message } from '@langchain/langgraph-sdk';
import { ProgressStep, ProgressStepper, Spinner } from '@patternfly/react-core';
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
  // PF compact steppers label only the current step: the latest running one, else the latest step.
  const runningIdx = steps.map((s) => s.status).lastIndexOf('running');
  const currentIdx = showProcessing ? -1 : runningIdx >= 0 ? runningIdx : steps.length - 1;

  return (
    <div className="app-task-strip" role="region" aria-label="Task progress">
      <ProgressStepper isCompact aria-label="Task progress steps">
        {steps.map((step, idx) => (
          <ProgressStep
            key={step.id}
            variant={step.status === 'complete' ? 'success' : 'info'}
            isCurrent={idx === currentIdx}
            title={step.name}
            icon={step.status === 'running' ? <Spinner size="sm" aria-label="Running" /> : undefined}
            id={`task-step-${step.id}`}
            titleId={`task-step-${step.id}-title`}
            aria-label={`${step.name}: ${step.status === 'complete' ? 'complete' : 'running'}`}
          >
            <span className={step.isSubAgent ? 'app-task-strip__sub' : undefined}>{step.name}</span>
          </ProgressStep>
        ))}
        {showProcessing && (
          <ProgressStep
            variant="info"
            isCurrent
            icon={<Spinner size="sm" aria-label="Running" />}
            id="task-step-processing"
            titleId="task-step-processing-title"
            aria-label="Processing: running"
          >
            Processing
          </ProgressStep>
        )}
      </ProgressStepper>
    </div>
  );
}
