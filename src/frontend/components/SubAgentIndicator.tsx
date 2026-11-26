import { ToolApprovalControls } from './ToolApprovalControls';
import type { ToolApproval } from '../hooks/useInterruptApprovals';
import { useEffect, useState } from 'react';
import {
  Card,
  CardBody,
  ExpandableSection,
  Label,
  Spinner,
} from '@patternfly/react-core';
import { CheckCircleIcon, ExclamationCircleIcon } from '@patternfly/react-icons';
import type { ToolCallWithContent } from '../types/deep-agent';
import { extractSubAgentName, extractDelegationText } from '../types/deep-agent';
import './sub-agent.css';

interface SubAgentIndicatorProps {
  readonly toolCall: ToolCallWithContent;
  readonly messageId: string;
  readonly index: number;
  readonly approval?: ToolApproval;
}

type VisualStatus = 'delegating' | 'complete' | 'error';

function hasContent(toolCall: ToolCallWithContent): boolean {
  if (toolCall.content == null) return false;
  if (typeof toolCall.content === 'string') return toolCall.content.trim().length > 0;
  return true;
}

function deriveStatus(toolCall: ToolCallWithContent): VisualStatus {
  if (!hasContent(toolCall)) return 'delegating';
  if (typeof toolCall.content === 'string' && toolCall.content.startsWith('Error')) return 'error';
  return 'complete';
}

const STATUS_CONFIG: Record<VisualStatus, {
  label: string;
  color: 'blue' | 'green' | 'red';
  icon: React.ReactNode;
}> = {
  delegating: { label: 'Working', color: 'blue', icon: <Spinner size="sm" aria-label="Working" /> },
  complete:   { label: 'Complete', color: 'green', icon: <CheckCircleIcon /> },
  error:      { label: 'Error', color: 'red', icon: <ExclamationCircleIcon /> },
};

export function SubAgentIndicator({ toolCall, messageId, index, approval }: SubAgentIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const needsApproval = Boolean(approval && !approval.decision);
  useEffect(() => { if (needsApproval) setExpanded(true); }, [needsApproval]);
  const name = extractSubAgentName(toolCall);
  const delegationText = extractDelegationText(toolCall);
  const status = deriveStatus(toolCall);
  const config = STATUS_CONFIG[status];
  const bodyId = `subagent-body-${messageId}-${index}`;

  const toggle = (
    <span className="app-subagent__toggle">
      <span className="app-subagent__name">{name}</span>
      <Label isCompact color={needsApproval ? 'yellow' : config.color} icon={config.icon}>
        {needsApproval ? 'Approval required' : config.label}
      </Label>
    </span>
  );

  return (
    <div className="app-subagent">
      <Card
        isCompact
        className={`app-subagent__card${needsApproval ? ' app-subagent__card--attention' : ''}`}
        data-interrupt-id={approval?.interruptId}
        data-action-index={approval?.actionIndex}
      >
        <CardBody>
          <ExpandableSection
            toggleContent={toggle}
            isExpanded={expanded}
            onToggle={(_e, isOpen) => setExpanded(isOpen)}
            contentId={bodyId}
            toggleId={`${bodyId}-toggle`}
          >
            <div className="app-subagent__body">
              {delegationText && (
                <div>
                  <p className="app-subagent__label">Delegation</p>
                  <p className="app-subagent-box">{delegationText}</p>
                </div>
              )}
              {hasContent(toolCall) && (
                <div>
                  <p className="app-subagent__label">Result</p>
                  <pre className="app-subagent-box">
                    {typeof toolCall.content === 'string'
                      ? toolCall.content
                      : JSON.stringify(toolCall.content, null, 2)}
                  </pre>
                </div>
              )}
              {status === 'delegating' && !needsApproval && (
                <p className="app-subagent__processing">Sub-agent is processing&hellip;</p>
              )}
            </div>
          </ExpandableSection>
        </CardBody>
        {needsApproval && approval && Object.keys(approval.request.args ?? {}).length > 0 && (
          <div className="app-subagent__args">
            <p className="app-subagent__label">Arguments</p>
            <pre className="app-subagent-box">
              {JSON.stringify(approval.request.args, null, 2)}
            </pre>
          </div>
        )}
        {approval && <ToolApprovalControls approval={approval} />}
      </Card>
    </div>
  );
}
