import { useState, useEffect } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Label,
} from '@patternfly/react-core';
import { Bot, Check, CheckCircle, ChevronDown, ChevronRight, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import type { ToolCallWithContent, InterruptInfo } from '../types/deep-agent';
import { extractSubAgentName, extractDelegationText } from '../types/deep-agent';

interface SubAgentIndicatorProps {
  readonly toolCall: ToolCallWithContent;
  readonly messageId: string;
  readonly index: number;
  readonly pendingInterrupt?: InterruptInfo | null;
  readonly onInterruptResume?: (decisions: Array<{ type: 'approve' | 'reject'; message?: string }>) => void;
  readonly onSingleDecision?: (decision: { type: 'approve' | 'reject'; message?: string }) => void;
  readonly isCurrentApproval?: boolean;
  readonly onAlwaysAllow?: (toolNames: string[]) => void;
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
  icon: typeof Loader2;
  animate: boolean;
}> = {
  delegating: { label: 'Working', color: 'blue', icon: Loader2, animate: true },
  complete:   { label: 'Complete', color: 'green', icon: CheckCircle, animate: false },
  error:      { label: 'Error', color: 'red', icon: AlertCircle, animate: false },
};

export function SubAgentIndicator({ toolCall, messageId, index, pendingInterrupt, onInterruptResume, onSingleDecision, isCurrentApproval, onAlwaysAllow }: SubAgentIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const name = extractSubAgentName(toolCall);
  const delegationText = extractDelegationText(toolCall);
  const status = deriveStatus(toolCall);
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  const interruptValue = pendingInterrupt?.value;
  const needsApproval = !!(
    typeof interruptValue === 'object'
    && interruptValue !== null
    && 'action_requests' in interruptValue
    && interruptValue.action_requests?.some((r) => r.name === 'task' || r.name === name)
  ) && toolCall.content == null;

  useEffect(() => {
    if (needsApproval) {
      setIsApproving(false);
      setExpanded(true);
    }
  }, [needsApproval, pendingInterrupt]);

  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${needsApproval ? 'bg-yellow-500/15 border border-yellow-500/40' : 'bg-blue-500/15 border border-blue-500/30'}`}
        aria-hidden="true"
      >
        <Bot className={`w-4 h-4 ${needsApproval ? 'text-yellow-500' : 'text-blue-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <Card isCompact className={`shadow-card ${needsApproval ? 'border-yellow-500/60' : ''}`}>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setExpanded((v) => !v)}
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpanded((v) => !v);
              }
            }}
            {...({ tabIndex: 0, role: 'button', 'aria-expanded': expanded, 'aria-controls': `subagent-body-${messageId}-${index}` } as React.HTMLAttributes<HTMLDivElement>)}
          >
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2.5">
                <CardTitle className="text-sm font-medium capitalize">
                  {name}
                </CardTitle>
                <Label
                  isCompact
                  color={needsApproval ? 'yellow' : config.color}
                  icon={
                    <StatusIcon
                      className={`w-3 h-3 ${config.animate && !needsApproval ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                  }
                >
                  {needsApproval ? 'Approval required' : config.label}
                </Label>
              </div>
              <span aria-hidden="true">
                {expanded ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </span>
            </div>
          </CardHeader>

          {expanded && (
            <CardBody
              id={`subagent-body-${messageId}-${index}`}
              className="border-t border-border pt-3 space-y-3 !pb-0"
            >
              {delegationText && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Delegation
                  </p>
                  <p className="text-xs text-foreground bg-muted border border-border p-3 rounded-lg whitespace-pre-wrap">
                    {delegationText}
                  </p>
                </div>
              )}
              {hasContent(toolCall) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Result
                  </p>
                  <pre className="text-xs text-foreground bg-muted border border-border p-3 rounded-lg overflow-auto font-mono max-h-60">
                    {typeof toolCall.content === 'string'
                      ? toolCall.content
                      : JSON.stringify(toolCall.content, null, 2)}
                  </pre>
                </div>
              )}
              {status === 'delegating' && !needsApproval && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Sub-agent is processing&hellip;
                </div>
              )}

              {needsApproval && !isApproving && (isCurrentApproval !== false) && (onSingleDecision || onInterruptResume) && (
                <div role="alert" aria-live="assertive" aria-label={`Sub-agent ${name} requires approval`} className="flex items-center gap-2 py-3 border-t border-yellow-500/30 bg-yellow-500/5 -mx-4 px-4 flex-wrap rounded-b-lg">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => {
                      setIsApproving(true);
                      if (onSingleDecision) {
                        onSingleDecision({ type: 'approve' });
                      } else {
                        onInterruptResume?.([{ type: 'approve' }]);
                      }
                    }}
                    aria-label={`Approve sub-agent action: ${name}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--chart-3)', color: 'var(--background)' }}
                  >
                    <Check className="w-3 h-3" aria-hidden="true" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsApproving(true);
                      if (onSingleDecision) {
                        onSingleDecision({ type: 'reject', message: 'User rejected this action.' });
                      } else {
                        onInterruptResume?.([{ type: 'reject', message: 'User rejected this action.' }]);
                      }
                    }}
                    aria-label={`Reject sub-agent action: ${name}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-colors"
                    style={{ backgroundColor: 'var(--destructive)', color: 'var(--background)' }}
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsApproving(true);
                      onAlwaysAllow?.([name]);
                      if (onSingleDecision) {
                        onSingleDecision({ type: 'approve' });
                      } else {
                        onInterruptResume?.([{ type: 'approve' }]);
                      }
                    }}
                    aria-label={`Always allow sub-agent: ${name}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-muted text-foreground hover:bg-muted/70 transition-colors"
                  >
                    <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                    Always allow
                  </button>
                </div>
              )}
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
