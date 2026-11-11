import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle, ChevronDown, ChevronRight, Loader2, ShieldCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { detectArtifactKind } from '../types/deep-agent';
import { parseMcpApp } from '../types/mcp-apps';
import { ArtifactViewer } from './ArtifactViewer';
import { McpAppHostFromToolCall } from './McpAppHost';

export interface ToolCallRowTool {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
  content?: unknown;
  status?: string;
  mcpApp?: unknown;
}

interface ToolCallRowProps {
  readonly toolCall: ToolCallRowTool;
  readonly itemId: string;
  readonly pendingToolNames: ReadonlySet<string>;
  readonly showButtons: boolean;
  readonly requestIndex?: number;
  readonly totalActionRequests: number;
  readonly onInterruptResume?: (decisions: Array<{ type: 'approve' | 'reject'; message?: string }>) => void;
  readonly onSingleDecision?: (decision: { type: 'approve' | 'reject'; message?: string }, requestIndex?: number) => void;
  readonly onAlwaysAllow?: (toolNames: string[]) => void;
}

function toolQueryHint(tool: ToolCallRowTool): string | null {
  const query = tool.args?.query;
  if (typeof query !== 'string' || query.trim().length === 0) return null;
  const trimmed = query.trim();
  return trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed;
}

export function ToolCallRow({
  toolCall,
  itemId,
  pendingToolNames,
  showButtons,
  requestIndex,
  totalActionRequests,
  onInterruptResume,
  onSingleDecision,
  onAlwaysAllow,
}: ToolCallRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [used, setUsed] = useState(false);
  const sent = useRef(false);
  const userExpandedRef = useRef(false);
  const userCollapsedRef = useRef(false);
  const choose = (action: () => void) => {
    if (sent.current) return;
    sent.current = true;
    setUsed(true);
    action();
  };
  const decide = (decision: { type: 'approve' | 'reject'; message?: string }) => {
    if (totalActionRequests > 1 && onSingleDecision) {
      onSingleDecision(decision, requestIndex);
    } else {
      onInterruptResume?.([decision]);
    }
  };
  useEffect(() => {
    if (!showButtons) {
      sent.current = false;
      setUsed(false);
    }
  }, [showButtons]);
  const needsApproval = (pendingToolNames.has(toolCall.name) || pendingToolNames.has('task')) && toolCall.content == null;
  const isFinished = toolCall.content != null;

  useEffect(() => {
    if (needsApproval && !userCollapsedRef.current) {
      setExpanded(true);
    } else if (isFinished && !userExpandedRef.current) {
      setExpanded(false);
    }
  }, [needsApproval, isFinished]);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      if (next) {
        userCollapsedRef.current = false;
        userExpandedRef.current = true;
      } else {
        userExpandedRef.current = false;
        userCollapsedRef.current = true;
      }
      return next;
    });
  };

  const mcpAppDesc = parseMcpApp(toolCall.mcpApp);
  const hasMcpApp = Boolean(mcpAppDesc);
  const failed = toolCall.status === 'error';
  const queryHint = toolQueryHint(toolCall);
  const buttons = showButtons && Boolean(onInterruptResume);

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden bg-card/50',
        needsApproval ? 'border-yellow-500/60' : 'border-border/40',
      )}
    >
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        aria-controls={`tool-body-${itemId}`}
        aria-label={`${expanded ? 'Collapse' : 'Expand'} tool call: ${toolCall.name}`}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs min-w-0">
          {failed ? (
            <AlertCircle className="w-3 h-3 text-red-500 shrink-0" aria-hidden="true" />
          ) : toolCall.content != null ? (
            <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" aria-hidden="true" />
          ) : (
            <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" aria-hidden="true" />
          )}
          <code className="font-mono text-[11px] bg-muted/50 px-1 py-0.5 rounded">{toolCall.name}</code>
          {queryHint && (
            <span className="text-muted-foreground/50 text-[11px] truncate">&quot;{queryHint}&quot;</span>
          )}
        </div>
        <span className="flex items-center gap-2 shrink-0 ml-2">
          {hasMcpApp && !expanded && (
            <span className="text-[11px] text-muted-foreground/70">Click to open UI</span>
          )}
          {expanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" aria-hidden="true" />
          )}
        </span>
      </button>

      {expanded && (
        <div id={`tool-body-${itemId}`} className="border-t border-border/30">
          <div className="px-3 pb-2 max-h-72 overflow-y-auto">
            <div className="text-[10px] font-medium text-muted-foreground/50 mb-1 mt-2 uppercase tracking-wider">Arguments</div>
            <pre className="text-[11px] text-foreground/70 bg-muted/40 border border-border/30 p-2 rounded overflow-auto font-mono">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
            {!needsApproval && hasMcpApp && (
              <div className="mt-2">
                <McpAppHostFromToolCall
                  mcpAppRaw={toolCall.mcpApp}
                  toolName={toolCall.name}
                  toolCancelled={toolCall.content != null && !mcpAppDesc?.result}
                  className="mb-2"
                />
              </div>
            )}
            {!needsApproval && (
              <>
                <div className={cn(
                  'text-[10px] font-medium mb-1 mt-2 uppercase tracking-wider',
                  failed ? 'text-red-500/70' : 'text-muted-foreground/50',
                )}>
                  {failed ? 'Error' : toolCall.content != null ? 'Result' : 'Running...'}
                </div>
                {(() => {
                  const raw = toolCall.content;
                  if (raw == null) return <p className="text-xs text-muted-foreground italic">Waiting...</p>;
                  const text = typeof raw === 'string' ? raw.slice(0, 2000) : JSON.stringify(raw, null, 2).slice(0, 2000);
                  const kind = detectArtifactKind(text);
                  if (kind !== 'text' && text.length > 100) {
                    return <ArtifactViewer content={text} title={`${toolCall.name} result`} />;
                  }
                  return (
                    <pre className="text-[11px] text-foreground/70 bg-muted/40 border border-border/30 p-2 rounded overflow-auto font-mono max-h-40">
                      {text}
                    </pre>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {buttons && !used && (
        <div role="alert" aria-live="assertive" aria-label={`Tool call ${toolCall.name} requires approval`} className="flex items-center gap-2 px-3 py-2 border-t border-yellow-500/30 bg-yellow-500/5 flex-wrap">
          <button
            type="button"
            autoFocus
            onClick={() => choose(() => decide({ type: 'approve' }))}
            aria-label={`Approve tool call: ${toolCall.name}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ backgroundColor: 'var(--chart-3)', color: 'var(--background)' }}
          >
            <Check className="w-3 h-3" aria-hidden="true" />
            Approve
          </button>
          <button
            type="button"
            onClick={() => choose(() => decide({ type: 'reject', message: 'User rejected this action.' }))}
            aria-label={`Reject tool call: ${toolCall.name}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-colors"
            style={{ backgroundColor: 'var(--destructive)', color: 'var(--background)' }}
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => choose(() => {
              onAlwaysAllow?.([toolCall.name]);
              decide({ type: 'approve' });
            })}
            aria-label={`Always allow tool: ${toolCall.name}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-muted text-foreground hover:bg-muted/70 transition-colors"
          >
            <ShieldCheck className="w-3 h-3" aria-hidden="true" />
            Always allow
          </button>
        </div>
      )}
    </div>
  );
}
