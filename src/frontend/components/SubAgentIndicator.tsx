import { useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Label,
} from '@patternfly/react-core';
import { Bot, CheckCircle, ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import type { ToolCallWithContent } from '../types/deep-agent';
import { extractSubAgentName, extractDelegationText } from '../types/deep-agent';

interface SubAgentIndicatorProps {
  readonly toolCall: ToolCallWithContent;
  readonly messageId: string;
  readonly index: number;
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

export function SubAgentIndicator({ toolCall, messageId, index }: SubAgentIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const name = extractSubAgentName(toolCall);
  const delegationText = extractDelegationText(toolCall);
  const status = deriveStatus(toolCall);
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  return (
    <div className="flex items-start gap-3">
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-blue-500/15 border border-blue-500/30"
        aria-hidden="true"
      >
        <Bot className="w-4 h-4 text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <Card isCompact className="shadow-card">
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
                  color={config.color}
                  icon={
                    <StatusIcon
                      className={`w-3 h-3 ${config.animate ? 'animate-spin' : ''}`}
                      aria-hidden="true"
                    />
                  }
                >
                  {config.label}
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
              {status === 'delegating' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Sub-agent is processing&hellip;
                </div>
              )}
            </CardBody>
          )}
        </Card>
      </div>
    </div>
  );
}
