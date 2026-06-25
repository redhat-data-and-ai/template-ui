import {
  Alert,
  AlertActionCloseButton,
  Button,
  Label,
} from '@patternfly/react-core';
import { CheckCircle, XCircle, ShieldCheck } from 'lucide-react';
import type { InterruptInfo, HITLActionRequest, HITLReviewConfig } from '../types/deep-agent';

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

  const toolLabel = actionRequests.length === 1
    ? `tool call`
    : `${actionRequests.length} tool calls`;

  return (
    <div role="alert">
      <Alert
        variant="warning"
        title={`Action required — approve ${toolLabel}`}
        isInline
        actionClose={<AlertActionCloseButton onClose={onDismiss} />}
      >
        <div className="space-y-2 mt-2">
          {actionRequests.map((req, i) => (
            <ToolCard
              key={`${req.name}-${i}`}
              request={req}
              reviewConfig={configByName[req.name]}
              index={i}
              total={actionRequests.length}
            />
          ))}

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
