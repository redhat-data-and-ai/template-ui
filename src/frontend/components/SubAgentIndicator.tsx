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
import { extractSubAgentName } from '../types/deep-agent';

interface SubAgentIndicatorProps {
  readonly toolCall: ToolCallWithContent;
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

export function SubAgentIndicator({ toolCall }: SubAgentIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const name = extractSubAgentName(toolCall);
  const status = deriveStatus(toolCall);
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/15 border border-blue-500/30 flex items-center justify-center">
        <Bot className="w-4 h-4 text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <Card isCompact className="shadow-card">
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
                  color={config.color}
                  icon={
                    <StatusIcon
                      className={`w-3 h-3 ${config.animate ? 'animate-spin' : ''}`}
                    />
                  }
                >
                  {config.label}
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
            <CardBody className="border-t border-border pt-3 space-y-3">
              {toolCall.args && Object.keys(toolCall.args).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Delegation
                  </p>
                  <pre className="text-xs text-foreground bg-muted border border-border p-3 rounded-lg overflow-auto font-mono max-h-40">
                    {JSON.stringify(
                      Object.fromEntries(
                        Object.entries(toolCall.args).filter(([k]) => k !== 'subagent_type'),
                      ),
                      null,
                      2,
                    )}
                  </pre>
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
              {status === 'delegating' && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
