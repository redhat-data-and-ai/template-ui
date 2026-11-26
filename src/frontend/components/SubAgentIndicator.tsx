import type { ReactNode } from 'react';
import { ToolApprovalControls } from './ToolApprovalControls';
import type { ToolApproval } from '../hooks/useInterruptApprovals';
import { useEffect, useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Label,
} from '@patternfly/react-core';
import { Bot, CheckCircle, ChevronDown, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { SubagentTranscriptEntry, ToolCallWithContent } from '../types/deep-agent';
import { extractSubAgentName, extractDelegationText } from '../types/deep-agent';
import { ToolCallRow } from './ToolCallRow';

interface SubAgentIndicatorProps {
  readonly toolCall: ToolCallWithContent;
  readonly messageId: string;
  readonly index: number;
  readonly approval?: ToolApproval;
  readonly approvalBindings?: Map<string, ToolApproval>;
  readonly extraApprovals?: ToolApproval[];
  readonly question?: ReactNode;
}

function hasPendingInnerApproval(
  transcript: SubagentTranscriptEntry[] | undefined,
  bindings: Map<string, ToolApproval> | undefined,
): boolean {
  return (transcript ?? []).some((entry) => (entry.tool_calls ?? []).some((tool) => {
    const found = tool.id ? bindings?.get(tool.id) : undefined;
    return Boolean(found && !found.decision);
  }));
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

const streamMarkdown = {
  table: ({ children }: { children?: ReactNode }) => (
    <div className="overflow-x-auto my-2">
      <table className="w-full border-collapse text-[12px]">{children}</table>
    </div>
  ),
  th: ({ children }: { children?: ReactNode }) => (
    <th className="border border-border px-2 py-1 text-left font-medium">{children}</th>
  ),
  td: ({ children }: { children?: ReactNode }) => (
    <td className="border border-border px-2 py-1 align-top">{children}</td>
  ),
  p: ({ children }: { children?: ReactNode }) => <p className="mb-1.5 last:mb-0">{children}</p>,
};

function SubagentThought({ text }: { text: string }) {
  return (
    <div className="text-[12px] leading-relaxed text-muted-foreground/60 italic [&_strong]:font-medium [&_strong]:text-muted-foreground/70 [&_p]:mb-1.5 [&_p:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

function SubagentStream({ text }: { text: string }) {
  return (
    <div className="text-[13px] leading-relaxed text-muted-foreground [&_p]:mb-1.5 [&_p:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={streamMarkdown}>{text}</ReactMarkdown>
    </div>
  );
}

const NO_PENDING_TOOLS = new Set<string>();

export function SubAgentIndicator({ toolCall, messageId, index, approval, approvalBindings, extraApprovals, question }: SubAgentIndicatorProps) {
  const hasInnerApproval = hasPendingInnerApproval(toolCall.transcript, approvalBindings);
  const pendingExtras = (extraApprovals ?? []).filter((item) => !item.decision);
  const hasExtraApproval = pendingExtras.length > 0;
  const [expanded, setExpanded] = useState(
    () => (!hasContent(toolCall) && (toolCall.transcript?.length ?? 0) > 0) || hasInnerApproval || hasExtraApproval,
  );
  const [streamChoice, setStreamChoice] = useState<boolean | null>(null);
  const needsApproval = Boolean(approval && !approval.decision);
  useEffect(() => { if (needsApproval || hasInnerApproval || hasExtraApproval) setExpanded(true); }, [needsApproval, hasInnerApproval, hasExtraApproval]);
  useEffect(() => { if (question) setExpanded(true); }, [question]);
  const name = extractSubAgentName(toolCall);
  const delegationText = extractDelegationText(toolCall);
  const status = deriveStatus(toolCall);
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;
  const transcript = toolCall.transcript ?? [];
  const hasStream = transcript.length > 0;
  const streamOpen = hasInnerApproval || hasExtraApproval || (streamChoice ?? status === 'delegating');

  return (
    <div className="flex items-start gap-3">
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-blue-500/15 border border-blue-500/30"
        aria-hidden="true"
      >
        <Bot className="w-4 h-4 text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <Card isCompact className={`shadow-card ${needsApproval ? 'border-yellow-500/60' : ''}`} data-interrupt-id={approval?.interruptId} data-action-index={approval?.actionIndex}>
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
                      className={`w-3 h-3 ${config.animate ? 'animate-spin' : ''}`}
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
              {hasStream && (
                <div>
                  <button
                    type="button"
                    className="flex items-center gap-1.5 px-1 py-1 text-left text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    aria-expanded={streamOpen}
                    onClick={() => { if (!hasInnerApproval && !hasExtraApproval) setStreamChoice(!streamOpen); }}
                  >
                    {streamOpen
                      ? <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
                      : <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />}
                    <span className={`text-xs ${streamOpen && status === 'delegating' ? 'animate-pulse' : 'italic'}`}>
                      {streamOpen && status === 'delegating' ? 'Streaming...' : 'Stream'}
                    </span>
                  </button>
                  {streamOpen && (
                    <div className="ml-1 pl-3 border-l-2 border-muted-foreground/15 space-y-3">
                      {transcript.map((entry) => (
                        <TranscriptEntryView
                          key={entry.id}
                          entry={entry}
                          messageId={messageId}
                          approvalBindings={approvalBindings}
                        />
                      ))}
                    </div>
                  )}
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
              {pendingExtras.map((extra) => (
                <div key={extra.key}>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    {extra.request.name}
                  </p>
                  {Object.keys(extra.request.args ?? {}).length > 0 && (
                    <pre className="text-xs text-foreground bg-muted border border-border p-3 rounded-lg overflow-auto font-mono max-h-60">
                      {JSON.stringify(extra.request.args, null, 2)}
                    </pre>
                  )}
                  <ToolApprovalControls approval={extra} />
                </div>
              ))}
              {question ? (
                <div className="pb-3">{question}</div>
              ) : status === 'delegating' && !needsApproval && transcript.length === 0 && pendingExtras.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground pb-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  Sub-agent is processing&hellip;
                </div>
              )}
            </CardBody>
          )}
          {needsApproval && approval && Object.keys(approval.request.args ?? {}).length > 0 && (
            <div className="px-4 py-3 border-t border-yellow-500/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                Arguments
              </p>
              <pre className="text-xs text-foreground bg-muted border border-border p-3 rounded-lg overflow-auto font-mono">
                {JSON.stringify(approval.request.args, null, 2)}
              </pre>
            </div>
          )}
          {approval && <ToolApprovalControls approval={approval} />}
        </Card>
      </div>
    </div>
  );
}

function TranscriptEntryView({
  entry,
  messageId,
  approvalBindings,
}: {
  entry: SubagentTranscriptEntry;
  messageId: string;
  approvalBindings?: Map<string, ToolApproval>;
}) {
  return (
    <div className="space-y-2">
      {entry.thinking ? <SubagentThought text={entry.thinking} /> : null}
      {entry.content ? <SubagentStream text={entry.content} /> : null}
      {entry.tool_calls?.map((tool, toolIndex) => {
        const rowApproval = tool.id ? approvalBindings?.get(tool.id) : undefined;
        return (
          <div key={tool.id ?? `${tool.name}-${toolIndex}`}>
            <ToolCallRow
              toolCall={tool}
              itemId={`${messageId}-${entry.id}-${tool.id ?? toolIndex}`}
              pendingToolNames={NO_PENDING_TOOLS}
              showButtons={false}
              totalActionRequests={0}
            />
            {rowApproval && <ToolApprovalControls approval={rowApproval} />}
          </div>
        );
      })}
    </div>
  );
}
