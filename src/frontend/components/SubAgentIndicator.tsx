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
  readonly onAlwaysAllow?: (toolNames: string[]) => void;
}

type VisualStatus = 'delegating' | 'complete' | 'error';

function deriveStatus(toolCall: ToolCallWithContent): VisualStatus {
  if (toolCall.content == null) return 'delegating';
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

export function SubAgentIndicator({ toolCall, messageId, index, pendingInterrupt, onInterruptResume, onAlwaysAllow }: SubAgentIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const name = extractSubAgentName(toolCall);
  const delegationText = extractDelegationText(toolCall);
  const status = deriveStatus(toolCall);
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  const actionRequests = pendingInterrupt?.value?.action_requests ?? [];
  const needsApproval = actionRequests.length > 0 && toolCall.content == null;

  useEffect(() => {
    if (needsApproval) {
      setIsApproving(false);
      setExpanded(true);
    }
  }, [needsApproval]);

  return (
    <div className="flex items-start gap-3">
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${needsApproval ? 'bg-yellow-500/15 border border-yellow-500/40' : 'bg-blue-500/15 border border-blue-500/30'}`}>
        <Bot className={`w-4 h-4 ${needsApproval ? 'text-yellow-500' : 'text-blue-500'}`} />
      </div>
      <div className="flex-1 min-w-0">
        <Card isCompact className={`shadow-card ${needsApproval ? 'border-yellow-500/60' : ''}`}>
          <CardHeader
            className="cursor-pointer"
            onClick={() => setExpanded((v) => !v)}
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
                    />
                  }
                >
                  {needsApproval ? 'Approval required' : config.label}
                </Label>
              </div>
              <button
                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                aria-label={expanded ? 'Collapse' : 'Expand'}
              >
                {expanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
            </div>
          </CardHeader>

          {expanded && (
            <CardBody className="border-t border-border pt-3 space-y-3 !pb-0">
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
              {toolCall.content != null && (
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

              {needsApproval && !isApproving && onInterruptResume && (
                <div className="py-3 border-t border-yellow-500/30 bg-yellow-500/5 -mx-4 px-4 rounded-b-lg space-y-2">
                  {actionRequests.length > 0 && actionRequests[0].name !== 'task' && actionRequests[0].name !== name && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-yellow-600 dark:text-yellow-400 uppercase tracking-wider">
                        Tool Approval Required
                      </p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Tool:</span>
                        <code className="font-mono font-semibold text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 px-1.5 py-0.5 rounded">
                          {actionRequests[0].name}
                        </code>
                      </div>
                      {actionRequests[0].args && Object.keys(actionRequests[0].args).length > 0 && (
                        <pre className="text-xs text-muted-foreground font-mono bg-muted/40 rounded px-2 py-1 max-h-20 overflow-y-auto">
                          {Object.entries(actionRequests[0].args)
                            .filter(([k]) => k !== 'description')
                            .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
                            .join('\n')}
                        </pre>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setIsApproving(true);
                      onInterruptResume([{ type: 'approve' }]);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--chart-3)', color: 'var(--background)' }}
                  >
                    <Check className="w-3 h-3" />
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsApproving(true);
                      onInterruptResume([{ type: 'reject', message: 'User rejected this action.' }]);
                    }}
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
                      onInterruptResume([{ type: 'approve' }]);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-muted text-foreground hover:bg-muted/70 transition-colors"
                  >
                    <ShieldCheck className="w-3 h-3" />
                    Always allow
                  </button>
                  </div>
                </div>
              )}
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
