import {
  Alert,
  AlertActionCloseButton,
  Button,
  Label,
} from '@patternfly/react-core';
import { CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import type { InterruptInfo, HITLActionRequest, HITLReviewConfig } from '../types/deep-agent';

interface ToolApprovalInfo {
  agentName: string;
  toolName: string;
}

function parseToolApproval(value: string): ToolApprovalInfo | null {
  const match = value.match(
    /subagent '([^']+)' wants to call '([^']+)'/
  );
  if (!match) return null;
  return { agentName: match[1], toolName: match[2] };
}

interface InterruptBannerProps {
  readonly interrupt: InterruptInfo;
  readonly onResume: (decisions: Array<{ type: 'approve' | 'reject'; message?: string }>) => void;
  readonly onAlwaysAllow: (toolNames: string[]) => void;
  readonly onDismiss: () => void;
}

function formatArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('\n');
}

interface ToolCardProps {
  readonly request: HITLActionRequest;
  readonly reviewConfig: HITLReviewConfig | undefined;
  readonly index: number;
  readonly total: number;
}

function ToolCard({ request, reviewConfig, index, total }: ToolCardProps) {
  const allowedDecisions = reviewConfig?.allowed_decisions ?? ['approve', 'reject'];
  const hasArgs = Object.keys(request.args).length > 0;

  return (
    <div className="rounded-lg border border-border bg-background/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono font-semibold text-warning-foreground bg-warning/10 px-1.5 py-0.5 rounded">
            {request.name}
          </code>
          {total > 1 && (
            <Label isCompact variant="outline">
              {index + 1} of {total}
            </Label>
          )}
        </div>
        <div className="flex gap-1 text-xs text-muted-foreground">
          {allowedDecisions.map((d) => (
            <span key={d} className="capitalize">{d}</span>
          ))}
        </div>
      </div>
      {hasArgs && (
        <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all font-mono leading-relaxed bg-muted/40 rounded px-2 py-1.5 max-h-32 overflow-y-auto">
          {formatArgs(request.args)}
        </pre>
      )}
    </div>
  );
}

/**
 * Attempt to extract tool-approval metadata from an action request.
 * Checks the request name and all string-valued args for the pattern.
 */
function extractToolApproval(request: HITLActionRequest): ToolApprovalInfo | null {
  const fromName = parseToolApproval(request.name);
  if (fromName) return fromName;

  for (const v of Object.values(request.args)) {
    if (typeof v === 'string') {
      const fromArg = parseToolApproval(v);
      if (fromArg) return fromArg;
    }
  }
  return null;
}

export function InterruptBanner({ interrupt, onResume, onAlwaysAllow, onDismiss }: InterruptBannerProps) {
  const { action_requests: actionRequests, review_configs: reviewConfigs } = interrupt.value;

  if (!Array.isArray(actionRequests) || actionRequests.length === 0) {
    return null;
  }

  const configByName = Object.fromEntries(
    (reviewConfigs ?? []).map((rc) => [rc.action_name, rc]),
  );

  const handleApproveAll = () => {
    onResume(actionRequests.map(() => ({ type: 'approve' })));
  };

  const handleRejectAll = () => {
    onResume(
      actionRequests.map(() => ({
        type: 'reject',
        message: 'User rejected this action. Do not retry unless asked.',
      })),
    );
  };

  const handleAlwaysAllow = () => {
    onAlwaysAllow(actionRequests.map((r) => r.name));
    onResume(actionRequests.map(() => ({ type: 'approve' })));
  };

  // Check if any action request matches the structured tool-approval pattern.
  // When there is exactly one request with a parseable approval, render the
  // enhanced view; otherwise fall back to the standard ToolCard list.
  const singleApproval =
    actionRequests.length === 1 ? extractToolApproval(actionRequests[0]) : null;

  const toolLabel = actionRequests.length === 1
    ? `tool call`
    : `${actionRequests.length} tool calls`;

  const alertTitle = singleApproval
    ? 'Tool Approval Required'
    : `Action required — approve ${toolLabel}`;

  return (
    <div role="alert">
      <Alert
        variant="warning"
        title={alertTitle}
        isInline
        actionClose={<AlertActionCloseButton onClose={onDismiss} />}
      >
        <div className="space-y-2 mt-2">
          {singleApproval ? (
            <div className="rounded-lg border border-border bg-background/60 p-3 space-y-1.5">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground font-medium">Subagent:</span>
                <code className="text-xs font-mono font-semibold bg-muted/40 px-1.5 py-0.5 rounded">
                  {singleApproval.agentName}
                </code>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground font-medium">Tool:</span>
                <code className="text-xs font-mono font-semibold text-warning-foreground bg-warning/10 px-1.5 py-0.5 rounded">
                  {singleApproval.toolName}
                </code>
              </div>
            </div>
          ) : (
            actionRequests.map((req, i) => (
              <ToolCard
                key={`${req.name}-${i}`}
                request={req}
                reviewConfig={configByName[req.name]}
                index={i}
                total={actionRequests.length}
              />
            ))
          )}

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <Button
              variant="primary"
              size="sm"
              icon={<CheckCircle className="w-3.5 h-3.5" />}
              onClick={handleApproveAll}
            >
              {actionRequests.length > 1 ? 'Approve all' : 'Approve'}
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon={<XCircle className="w-3.5 h-3.5" />}
              onClick={handleRejectAll}
            >
              {actionRequests.length > 1 ? 'Reject all' : 'Reject'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={<ShieldCheck className="w-3.5 h-3.5" />}
              onClick={handleAlwaysAllow}
            >
              Always allow
            </Button>
          </div>
        </div>
      </Alert>
    </div>
  );
}
