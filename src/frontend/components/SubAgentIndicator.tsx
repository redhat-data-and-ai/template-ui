import { useEffect, useRef, useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Label,
} from '@patternfly/react-core';
import { Bot, Check, CheckCircle, ChevronDown, ChevronRight, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import type { ToolCallWithContent, InterruptInfo } from '../types/deep-agent';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';
import { markdownSanitizeSchema } from '../lib/markdown-sanitize';
import { markdownComponentsCompact } from '../lib/markdown-compact';
import { SubagentCurrentStep, SubagentElapsed, SubagentTimeline } from './SubagentTimeline';
import type { DelegationProgress } from '../lib/subagent-steps';
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
  /**
   * Live progress from this subagent's nested graph, when streaming
   * it is enabled. Absent means the delegation is opaque, which is
   * what this box showed for every delegation before: a static
   * "processing" line for a run that can last two minutes.
   */
  readonly progress?: DelegationProgress;
}

type VisualStatus = 'delegating' | 'complete' | 'error' | 'stopped';



function hasContent(toolCall: ToolCallWithContent): boolean {
  if (toolCall.content == null) return false;
  if (typeof toolCall.content === 'string') return toolCall.content.trim().length > 0;
  return true;
}

function deriveStatus(toolCall: ToolCallWithContent): VisualStatus {
  // An explicit terminal status outranks the content.
  //
  // When a turn ends with a delegation unresolved — timed out,
  // errored, stopped — the reducer stamps `status` and sets content
  // to the error message, which is the empty string when there is
  // nothing to say. `hasContent` is false for '', so the box went on
  // reporting "Working" with a live clock for a turn that had been
  // over for seventeen minutes.
  if (toolCall.status === 'cancelled') return 'stopped';
  if (toolCall.status === 'error') return 'error';
  if (!hasContent(toolCall)) return 'delegating';
  if (typeof toolCall.content === 'string' && toolCall.content.startsWith('Error')) return 'error';
  return 'complete';
}

const STATUS_CONFIG: Record<VisualStatus, {
  labelKey: string;
  color: 'blue' | 'green' | 'red';
  icon: typeof Loader2;
  animate: boolean;
}> = {
  // `labelKey`, not `label`: this map is module-level, so a literal
  // here would be resolved once at import time, before i18n has a
  // language.
  delegating: { labelKey: 'subagents.working', color: 'blue', icon: Loader2, animate: true },
  complete:   { labelKey: 'subagents.complete', color: 'green', icon: CheckCircle, animate: false },
  error:      { labelKey: 'common.error', color: 'red', icon: AlertCircle, animate: false },
  stopped:    { labelKey: 'subagents.stopped', color: 'red', icon: AlertCircle, animate: false },
};

export function SubAgentIndicator({ toolCall, messageId, index, pendingInterrupt, onInterruptResume, onSingleDecision, isCurrentApproval, onAlwaysAllow, progress }: SubAgentIndicatorProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const streamRef = useRef<HTMLDivElement>(null);
  const streamedText = progress?.latest ?? '';

  // What the Result block shows: the finished content once there is
  // one, the live stream until then.
  const finished = hasContent(toolCall);
  const resultText = finished
    ? typeof toolCall.content === 'string'
      ? toolCall.content
      : JSON.stringify(toolCall.content, null, 2)
    : streamedText;
  // A tool that returned JSON is not prose and must not be reflowed
  // as if it were; everything else is a written report.
  const resultIsMarkdown = finished ? typeof toolCall.content === 'string' : true;

  // Keep the newest text in view while it streams, unless the reader
  // has scrolled up to read something — yanking them back to the
  // bottom mid-sentence is worse than letting the tail run off.
  useEffect(() => {
    const el = streamRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [streamedText]);
  const name = extractSubAgentName(toolCall);
  const delegationText = extractDelegationText(toolCall);
  const status = deriveStatus(toolCall);
  const config = STATUS_CONFIG[status];
  const StatusIcon = config.icon;

  const interruptValue = pendingInterrupt?.value;
  const requests = (typeof interruptValue === 'object' && interruptValue !== null)
    ? (interruptValue.action_requests ?? [])
    : [];
  const isLaunchApproval = requests.some((r) => r.name === 'task' || r.name === name);
  const isInnerToolApproval = requests.length > 0 && !isLaunchApproval;
  const needsApproval = (isLaunchApproval || isInnerToolApproval) && toolCall.content == null;
  const alwaysAllowNames = isLaunchApproval ? [name] : requests.map((r) => r.name);
  const innerToolLabel = requests.map((r) => r.name).join(', ') || name;

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
                  {needsApproval ? t('subagents.approvalRequired') : t(config.labelKey)}
                  {status === 'delegating' && !needsApproval && progress && (
                    <>
                      {' · '}
                      <SubagentElapsed since={progress.startedAt} />
                    </>
                  )}
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

          {/* Outside the collapse: the current operation only.
              A delegation runs for minutes behind one opaque call,
              and what the reader needs here is what it is doing and
              how far along — not the report, which the orchestrator
              relays in the answer anyway, and not the full history,
              which is one click down. */}
          {status === 'delegating' && !needsApproval && (
            <div className="px-4 pb-3">
              {progress && progress.steps.length > 0 ? (
                <SubagentCurrentStep steps={progress.steps} runningSince={progress.startedAt} />
              ) : (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-1.5 h-1.5 shrink-0 rounded-full bg-blue-500 animate-pulse" />
                  <span aria-live="polite">{t('subagents.processing')}</span>
                </div>
              )}
            </div>
          )}

          {expanded && (
            <CardBody
              id={`subagent-body-${messageId}-${index}`}
              className="border-t border-border pt-3 space-y-3 !pb-0"
            >
              {progress && progress.steps.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    {t('subagents.steps')}
                  </p>
                  <SubagentTimeline
                    steps={progress.steps}
                    runningSince={status === 'delegating' ? progress.startedAt : undefined}
                  />
                </div>
              )}
              {(hasContent(toolCall) || streamedText) && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-2">
                    {t('common.result')}
                    {!hasContent(toolCall) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                    )}
                  </p>
                  <div
                    ref={streamRef}
                    data-testid={hasContent(toolCall) ? 'subagent-result' : 'subagent-stream'}
                    aria-live={hasContent(toolCall) ? undefined : 'polite'}
                    className="text-xs text-foreground bg-muted p-3 rounded-lg overflow-auto max-h-60 break-words"
                  >
                    {/* Rendered, not quoted. A subagent report is
                        markdown — headings, lists, a table of merge
                        requests — and as raw text in a monospace
                        block it arrived as a wall of `###` and `|`.
                        Streaming markdown reflows a little as it
                        lands, the same as the main answer does. */}
                    {resultIsMarkdown ? (
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]}
                        components={markdownComponentsCompact}
                      >
                        {resultText}
                      </ReactMarkdown>
                    ) : (
                      <pre className="font-mono whitespace-pre-wrap">{resultText}</pre>
                    )}
                  </div>
                </div>
              )}
              {delegationText && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    {t('subagents.delegation')}
                  </p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">
                    {delegationText}
                  </p>
                </div>
              )}
              {/* One Result block, filled either way.
                  While the subagent works it holds the streamed text
                  and grows; when the delegation finishes the final
                  content takes its place in the same spot. Streaming
                  into a separate block above meant the result still
                  arrived in a single jump, which is what "it does
                  not appear as streaming" was describing. */}
              {isInnerToolApproval && needsApproval && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                    Tool
                  </p>
                  {requests.map((r) => (
                    <div key={r.name} className="space-y-1.5">
                      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{r.name}</code>
                      {r.args && Object.keys(r.args).length > 0 && (
                        <pre className="text-xs text-foreground bg-muted p-3 rounded-lg overflow-auto font-mono">
                          {JSON.stringify(r.args, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {needsApproval && !isApproving && (isInnerToolApproval || isCurrentApproval !== false) && (onSingleDecision || onInterruptResume) && (
                <div role="alert" aria-live="assertive" aria-label={isInnerToolApproval ? `Tool ${innerToolLabel} requires approval` : `Sub-agent ${name} requires approval`} className="flex items-center gap-2 py-3 border-t border-yellow-500/30 bg-yellow-500/5 -mx-4 px-4 flex-wrap rounded-b-lg">
                  <button
                    type="button"
                    autoFocus
                    onClick={() => {
                      setIsApproving(true);
                      if (isInnerToolApproval) {
                        onInterruptResume?.(requests.map(() => ({ type: 'approve' as const })));
                      } else if (onSingleDecision) {
                        onSingleDecision({ type: 'approve' });
                      } else {
                        onInterruptResume?.([{ type: 'approve' }]);
                      }
                    }}
                    aria-label={isInnerToolApproval ? t('subagents.approveTool', { name: innerToolLabel }) : t('subagents.approveAction', { name })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{ backgroundColor: 'var(--chart-3)', color: 'var(--background)' }}
                  >
                    <Check className="w-3 h-3" aria-hidden="true" />
                    {t('chat.approve')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsApproving(true);
                      if (isInnerToolApproval) {
                        onInterruptResume?.(requests.map(() => ({ type: 'reject' as const, message: 'User rejected this action.' })));
                      } else if (onSingleDecision) {
                        onSingleDecision({ type: 'reject', message: 'User rejected this action.' });
                      } else {
                        onInterruptResume?.([{ type: 'reject', message: 'User rejected this action.' }]);
                      }
                    }}
                    aria-label={isInnerToolApproval ? t('subagents.rejectTool', { name: innerToolLabel }) : t('subagents.rejectAction', { name })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-colors"
                    style={{ backgroundColor: 'var(--destructive)', color: 'var(--background)' }}
                  >
                    {t('chat.reject')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsApproving(true);
                      onAlwaysAllow?.(alwaysAllowNames);
                      if (isInnerToolApproval) {
                        onInterruptResume?.(requests.map(() => ({ type: 'approve' as const })));
                      } else if (onSingleDecision) {
                        onSingleDecision({ type: 'approve' });
                      } else {
                        onInterruptResume?.([{ type: 'approve' }]);
                      }
                    }}
                    aria-label={isInnerToolApproval ? t('subagents.alwaysAllowTool', { name: innerToolLabel }) : t('subagents.alwaysAllowAgent', { name })}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-muted text-foreground hover:bg-muted/70 transition-colors"
                  >
                    <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                    {t('chat.alwaysAllow')}
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
