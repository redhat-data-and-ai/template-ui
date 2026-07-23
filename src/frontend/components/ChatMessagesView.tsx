import type React from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { AlertCircle, Check, CheckCircle, ChevronDown, ChevronRight, Copy, Download, Loader2, Pencil, RotateCcw, Settings, Bot, User, ShieldCheck } from "lucide-react";
import type { InterruptInfo } from "../types/deep-agent";
import { InputForm } from "./InputForm";
import { McpStatusPanel } from "./McpStatusPanel";
import { useState, ReactNode, useMemo, useEffect, useRef, Fragment } from "react";
import { cn } from "../lib/utils";
import {
  Dropdown,
  DropdownItem,
  DropdownList,
  ExpandableSection,
  Label,
  MenuToggle,
  type MenuToggleElement,
} from "@patternfly/react-core";
import {
  ProcessedEvent,
} from "./ActivityTimeline";
import { StreamEvent } from "../hooks/useDataStream";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { isSubAgentToolCall, detectArtifactKind } from "../types/deep-agent";
import { SubAgentIndicator } from "./SubAgentIndicator";
import { ArtifactViewer } from "./ArtifactViewer";
import { TodoStrip } from "./TodoStrip";
import { FeedbackButtons } from "./FeedbackButtons";
import { CustomDataRenderer } from "./CustomDataRenderer";

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b: unknown) => {
        if (typeof b === 'string') return b;
        if (b && typeof b === 'object' && 'type' in b && 'text' in b) {
          const block = b as { type: string; text: string };
          if (block.type === 'text' && typeof block.text === 'string') return block.text;
        }
        return '';
      })
      .join('');
  }
  return '';
}

function stripThinkingFromPlainText(text: string): { thinking: string; display: string } {
  const thinkingParts: string[] = [];
  let display = text;
  const patterns: RegExp[] = [
    /<think>([\s\S]*?)<\/redacted_thinking>/gi,
    /<thinking>([\s\S]*?)<\/thinking>/gi,
  ];
  for (const re of patterns) {
    display = display.replace(re, (_full, inner: string) => {
      thinkingParts.push(String(inner).trim());
      return '';
    });
  }
  return {
    thinking: thinkingParts.filter(Boolean).join('\n\n'),
    display: display.replace(/\n{3,}/g, '\n\n').trim(),
  };
}

function partitionMessageContent(content: unknown): { thinkingText: string; markdownForDisplay: string } {
  if (typeof content === 'string') {
    const { thinking, display } = stripThinkingFromPlainText(content);
    return { thinkingText: thinking, markdownForDisplay: display };
  }
  if (Array.isArray(content)) {
    const thinkingFromBlocks: string[] = [];
    const restBlocks: unknown[] = [];
    for (const b of content) {
      if (
        b &&
        typeof b === 'object' &&
        'type' in b &&
        (b as { type: string }).type === 'thinking'
      ) {
        const block = b as { type: string; text?: string; reasoning?: string };
        const piece =
          typeof block.text === 'string'
            ? block.text
            : typeof block.reasoning === 'string'
              ? block.reasoning
              : JSON.stringify(block);
        thinkingFromBlocks.push(piece);
        continue;
      }
      restBlocks.push(b);
    }
    const restJoined = restBlocks
      .map((b: unknown) => {
        if (typeof b === 'string') return b;
        if (b && typeof b === 'object' && 'type' in b && 'text' in b) {
          const block = b as { type: string; text: string };
          if (block.type === 'text' && typeof block.text === 'string') return block.text;
        }
        return '';
      })
      .join('');
    const { thinking: thinkingInText, display: afterTags } = stripThinkingFromPlainText(restJoined);
    const thinkingText = [thinkingFromBlocks.join('\n\n'), thinkingInText].filter(Boolean).join('\n\n');
    return { thinkingText, markdownForDisplay: afterTags };
  }
  return { thinkingText: '', markdownForDisplay: '' };
}

function getCopyableAiMessageText(content: unknown): string {
  const { thinkingText, markdownForDisplay } = partitionMessageContent(content);
  const main =
    markdownForDisplay.length > 0 ? markdownForDisplay : extractMessageText(content);
  if (!thinkingText) return main;
  return [thinkingText, main].filter((s) => s.length > 0).join('\n\n');
}

type MdComponentProps = {
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
};

function getPlainTextFromReactNode(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(getPlainTextFromReactNode).join('');
  if (typeof node === 'object' && 'props' in node) {
    const el = node as { props?: { children?: React.ReactNode } };
    return getPlainTextFromReactNode(el.props?.children);
  }
  return '';
}

function MarkdownPre({ className, children, ...props }: MdComponentProps) {
  const [copied, setCopied] = useState(false);
  const codeText = useMemo(() => getPlainTextFromReactNode(children), [children]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(codeText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="relative group/codeblock my-3">
      <button
        type="button"
        onClick={() => handleCopy()}
        className="absolute top-2 right-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card/90 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground"
        aria-label={copied ? 'Copied' : 'Copy code'}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre
        className={cn(
          "bg-muted border border-border pt-10 pr-3 pb-4 pl-4 rounded-xl overflow-x-auto font-mono text-[13px]",
          className
        )}
        {...props}
      >
        {children}
      </pre>
    </div>
  );
}

function MessageCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const disabled = text.length === 0;

  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground disabled:pointer-events-none disabled:opacity-40',
      )}
      aria-label={copied ? 'Copied' : 'Copy message'}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

const mdComponents = {
  h1: ({ className, children, ...props }: MdComponentProps) => (
    <h1 className={cn("text-2xl font-bold mt-4 mb-2 text-foreground", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }: MdComponentProps) => (
    <h2 className={cn("text-xl font-semibold mt-3 mb-2 text-foreground", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }: MdComponentProps) => (
    <h3 className={cn("text-lg font-semibold mt-3 mb-1 text-foreground", className)} {...props}>
      {children}
    </h3>
  ),
  p: ({ className, children, ...props }: MdComponentProps) => (
    <p className={cn("mb-3 leading-7 text-foreground/90", className)} {...props}>
      {children}
    </p>
  ),
  a: ({ className, children, href, ...props }: MdComponentProps) => (
    <Label isCompact className="mx-0.5">
      <a
        className={cn("text-primary hover:text-primary/80 text-xs", className)}
        href={href as string}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    </Label>
  ),
  ul: ({ className, children, ...props }: MdComponentProps) => (
    <ul className={cn("list-disc pl-6 mb-3 space-y-1", className)} {...props}>
      {children}
    </ul>
  ),
  ol: ({ className, children, ...props }: MdComponentProps) => (
    <ol className={cn("list-decimal pl-6 mb-3 space-y-1", className)} {...props}>
      {children}
    </ol>
  ),
  li: ({ className, children, ...props }: MdComponentProps) => (
    <li className={cn("mb-1 text-foreground/90", className)} {...props}>
      {children}
    </li>
  ),
  blockquote: ({ className, children, ...props }: MdComponentProps) => (
    <blockquote
      className={cn(
        "border-l-3 border-primary/40 pl-4 italic my-3 text-sm text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }: MdComponentProps) => (
    <code
      className={cn(
        "bg-muted rounded-md px-1.5 py-0.5 font-mono text-[13px] text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </code>
  ),
  pre: MarkdownPre,
  hr: ({ className, ...props }: MdComponentProps) => (
    <hr className={cn("border-border my-4", className)} {...props} />
  ),
  table: ({ className, children, ...props }: MdComponentProps) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className={cn("border-collapse w-full", className)} {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ className, children, ...props }: MdComponentProps) => (
    <thead className={cn("bg-muted/70", className)} {...props}>
      {children}
    </thead>
  ),
  tbody: ({ className, children, ...props }: MdComponentProps) => (
    <tbody className={cn("", className)} {...props}>
      {children}
    </tbody>
  ),
  tr: ({ className, children, ...props }: MdComponentProps) => (
    <tr className={cn("border-b border-border", className)} {...props}>
      {children}
    </tr>
  ),
  th: ({ className, children, ...props }: MdComponentProps) => (
    <th
      className={cn(
        "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className
      )}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ className, children, ...props }: MdComponentProps) => (
    <td className={cn("px-4 py-2.5 text-sm", className)} {...props}>
      {children}
    </td>
  ),
  img: ({ className, alt, ...props }: MdComponentProps) => (
    <img className={cn("w-full h-auto rounded-lg", className)} alt={(alt as string) ?? ''} {...props} />
  ),
};

interface HumanMessageBubbleProps {
  message: Message;
  messageIndex: number;
  isLastHuman: boolean;
  isLoading?: boolean;
  onEditMessage?: (messageIndex: number, newContent: string) => void;
}

const HumanMessageBubble: React.FC<HumanMessageBubbleProps> = ({
  message,
  messageIndex,
  isLastHuman,
  isLoading = false,
  onEditMessage,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const plain = extractMessageText(message.content);
  const canEdit = Boolean(onEditMessage) && isLastHuman && !isLoading;

  const startEdit = () => {
    setDraft(plain);
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft('');
  };

  const saveEdit = () => {
    const trimmed = draft.trim();
    if (trimmed === '' || !onEditMessage) return;
    onEditMessage(messageIndex, trimmed);
    setIsEditing(false);
  };

  return (
    <div className="flex items-end gap-3 justify-end group/msg">
      <div
        className={cn(
          "relative rounded-2xl rounded-br-sm break-words max-w-[85%] sm:max-w-[75%] px-4 py-3 bg-primary text-primary-foreground shadow-card",
          isEditing && "w-full sm:w-[75%]",
        )}
      >
        {isEditing ? (
          <div className="space-y-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full min-h-[88px] rounded-lg border border-primary-foreground/35 bg-primary-foreground/10 p-2.5 text-sm text-primary-foreground placeholder:text-primary-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary-foreground/40"
              aria-label="Edit message"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => saveEdit()}
                aria-label="Save edited message"
                className="rounded-md bg-primary-foreground px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary-foreground/90"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => cancelEdit()}
                aria-label="Cancel editing message"
                className="rounded-md border border-primary-foreground/40 px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary-foreground/10"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {canEdit && (
              <button
                type="button"
                onClick={() => startEdit()}
                className="absolute right-3 top-3 z-10 inline-flex h-7 w-7 items-center justify-center rounded-md text-primary-foreground/80 opacity-0 transition-opacity hover:bg-primary-foreground/15 hover:text-primary-foreground group-hover/msg:opacity-100"
                aria-label="Edit message"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
            <div className="text-sm leading-relaxed [&_p]:!text-primary-foreground [&_p]:!mb-1.5 [&_p:last-child]:!mb-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {plain}
              </ReactMarkdown>
            </div>
          </>
        )}
      </div>
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <User className="w-4 h-4 text-primary" />
      </div>
    </div>
  );
};

interface AiMessageBubbleProps {
  message: Message;
}

const AiMessageBubble: React.FC<AiMessageBubbleProps> = ({ message }) => {
  const { thinkingText, markdownForDisplay } = partitionMessageContent(message.content);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const customRaw = (message as Record<string, unknown>).custom_data;
  const customData =
    customRaw != null && typeof customRaw === 'object' && !Array.isArray(customRaw)
      ? (customRaw as Record<string, unknown>)
      : null;
  const bodyMd =
    markdownForDisplay.length > 0
      ? markdownForDisplay
      : thinkingText.length > 0
        ? ''
        : extractMessageText(message.content);

  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full gradient-brand flex items-center justify-center shadow-sm">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0 max-w-[85%] sm:max-w-[80%]">
        <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-card">
          {thinkingText.length > 0 && (
            <div className="mb-3">
              <ExpandableSection
                toggleText="Thinking..."
                isExpanded={thinkingExpanded}
                onToggle={(_e, expanded) => setThinkingExpanded(expanded)}
                isIndented
                className="pf-v6-u-mb-0"
              >
                <div className="mt-2 rounded-lg bg-muted/70 p-3 font-mono text-xs leading-relaxed text-foreground/85 whitespace-pre-wrap border border-border/60">
                  {thinkingText}
                </div>
              </ExpandableSection>
            </div>
          )}
          {bodyMd.length > 0 && (
            <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{bodyMd}</ReactMarkdown>
            </div>
          )}
          {customData && <CustomDataRenderer data={customData} />}
        </div>
      </div>
    </div>
  );
};

interface AIMessageRendererProps {
  message: Message;
  pendingInterrupt?: InterruptInfo | null;
  onInterruptResume?: (decisions: Array<{ type: 'approve' | 'reject'; message?: string }>) => void;
  onAlwaysAllow?: (toolNames: string[]) => void;
}

export function AIMessageRenderer({ message, pendingInterrupt, onInterruptResume, onAlwaysAllow }: AIMessageRendererProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [approvalSubmitted, setApprovalSubmitted] = useState(false);
  const messageKey = JSON.stringify(message);

  useEffect(() => {
    if (pendingInterrupt) {
      setApprovalSubmitted(false);
    }
  }, [pendingInterrupt]);

  const pendingToolNames = useMemo(
    () => {
      const v = pendingInterrupt?.value;
      const requests = (typeof v === 'object' && v !== null) ? (v.action_requests ?? []) : [];
      return new Set(requests.map((r) => r.name));
    },
    [pendingInterrupt],
  );

  useEffect(() => {
    if (!pendingToolNames.size) return;
    const allToolCalls = (message as any).tool_calls;
    if (!Array.isArray(allToolCalls)) return;
    const visibleCalls = allToolCalls.filter(
      (tc: any) => !isSubAgentToolCall(tc) && tc.name !== 'write_todos',
    );
    setExpandedItems((prev) => {
      const next = new Set(prev);
      visibleCalls.forEach((tc: any, idx: number) => {
        if (pendingToolNames.has(tc.name) || pendingToolNames.has('task')) {
          next.add(`${message.id}-${idx}`);
        }
      });
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingToolNames, message.id]);

  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const renderMessage = useMemo(() => {
    const isToolCallStart = message.type === 'ai' && Array.isArray(message?.tool_calls) && message?.tool_calls?.length > 0;
    const isNormalMessage = message.type === 'ai' && (!Array.isArray(message?.tool_calls) || message?.tool_calls?.length === 0);

    const customRaw = (message as Record<string, unknown>).custom_data;
    const customData =
      customRaw != null && typeof customRaw === 'object' && !Array.isArray(customRaw)
        ? (customRaw as Record<string, unknown>)
        : null;

    if (isToolCallStart) {
      const subAgentCalls = message.tool_calls?.filter((tc) => isSubAgentToolCall(tc)) ?? [];
      const regularCalls = message.tool_calls?.filter((tc) => !isSubAgentToolCall(tc) && tc.name !== 'write_todos') ?? [];

      return (
        <div className="space-y-2 w-full">
          {subAgentCalls.map((toolCall, idx) => (
            <SubAgentIndicator
              key={`${message.id}-sa-${idx}`}
              toolCall={toolCall as any}
              messageId={message.id ?? ''}
              index={idx}
              pendingInterrupt={pendingInterrupt}
              onInterruptResume={onInterruptResume}
              onAlwaysAllow={onAlwaysAllow}
            />
          ))}

          {regularCalls.length > 0 && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
                <Settings className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                {regularCalls.map((toolCall, idx) => {
                  const itemId = `${message.id}-${idx}`;
                  const isExpanded = expandedItems.has(itemId);
                  const needsApproval = (pendingToolNames.has(toolCall.name) || pendingToolNames.has('task')) && !(toolCall as Record<string, unknown>).content;

                  return (
                    <div
                      key={itemId}
                      className={cn(
                        "bg-card border rounded-xl overflow-hidden shadow-card transition-colors",
                        needsApproval ? "border-yellow-500/60" : "border-border",
                      )}
                    >
                      <button
                        onClick={() => toggleExpand(itemId)}
                        aria-expanded={isExpanded}
                        aria-controls={`tool-body-${itemId}`}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} tool call: ${toolCall.name}`}
                        className="w-full flex items-center justify-between p-3.5 hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="text-left">
                            <div className="text-sm font-medium text-foreground flex items-center gap-2">
                              <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{toolCall.name}</code>
                              {(toolCall as Record<string, unknown>).content != null ? (
                                <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" aria-hidden="true" />
                              ) : (
                                <Loader2 className="w-4 h-4 text-primary animate-spin" aria-hidden="true" />
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">Tool execution</div>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        )}
                      </button>

                      {isExpanded && (
                        <div id={`tool-body-${itemId}`} className="border-t border-border">
                          <div className="px-4 pb-3">
                            <div className="text-xs font-medium text-muted-foreground mb-2 mt-3 uppercase tracking-wider">Arguments</div>
                            <pre className="text-xs text-foreground bg-muted border border-border p-3 rounded-lg overflow-auto font-mono">
                              {JSON.stringify(toolCall.args, null, 2)}
                            </pre>
                            {!needsApproval && (
                              <>
                                <div className="text-xs font-medium text-muted-foreground mb-2 mt-3 uppercase tracking-wider">
                                  {(toolCall as Record<string, unknown>).content ? 'Result' : 'Running...'}
                                </div>
                                {(() => {
                                  const raw = (toolCall as Record<string, unknown>).content;
                                  if (raw == null) return <p className="text-xs text-muted-foreground italic">Waiting...</p>;
                                  const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
                                  const kind = detectArtifactKind(text);
                                  if (kind !== 'text' && text.length > 100) {
                                    return <ArtifactViewer content={text} title={`${toolCall.name} result`} />;
                                  }
                                  return (
                                    <pre className="text-xs text-foreground bg-muted border border-border p-3 rounded-lg overflow-auto font-mono">
                                      {text}
                                    </pre>
                                  );
                                })()}
                              </>
                            )}
                          </div>

                          {needsApproval && !approvalSubmitted && onInterruptResume && (
                            <div role="alert" aria-live="assertive" aria-label={`Tool call ${toolCall.name} requires approval`} className="flex items-center gap-2 px-4 py-3 border-t border-yellow-500/30 bg-yellow-500/5 flex-wrap">
                              <button
                                type="button"
                                autoFocus
                                onClick={() => {
                                  setApprovalSubmitted(true);
                                  const count = ((pendingInterrupt?.value as any)?.action_requests ?? []).length || 1;
                                  onInterruptResume(Array.from({ length: count }, () => ({ type: 'approve' as const })));
                                }}
                                aria-label={`Approve tool call: ${toolCall.name}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                style={{ backgroundColor: 'var(--chart-3)', color: 'var(--background)' }}
                              >
                                <Check className="w-3 h-3" aria-hidden="true" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setApprovalSubmitted(true);
                                  const count = ((pendingInterrupt?.value as any)?.action_requests ?? []).length || 1;
                                  onInterruptResume(Array.from({ length: count }, () => ({ type: 'reject' as const, message: 'User rejected this action.' })));
                                }}
                                aria-label={`Reject tool call: ${toolCall.name}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-90 transition-colors"
                                style={{ backgroundColor: 'var(--destructive)', color: 'var(--background)' }}
                              >
                                Reject
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setApprovalSubmitted(true);
                                  const count = ((pendingInterrupt?.value as any)?.action_requests ?? []).length || 1;
                                  onAlwaysAllow?.([toolCall.name]);
                                  onInterruptResume(Array.from({ length: count }, () => ({ type: 'approve' as const })));
                                }}
                                aria-label={`Always allow tool: ${toolCall.name}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-muted text-foreground hover:bg-muted/70 transition-colors"
                              >
                                <ShieldCheck className="w-3 h-3" aria-hidden="true" />
                                Always allow
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {customData && (
            <div className="w-full mt-2">
              <CustomDataRenderer data={customData} />
            </div>
          )}
        </div>
      );
    }

    if (isNormalMessage) {
      return <AiMessageBubble message={message} />;
    }

    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageKey, expandedItems, approvalSubmitted, pendingInterrupt, onInterruptResume, onAlwaysAllow]);

  return (
    <div className="space-y-2 w-full">
      {renderMessage}
    </div>
  );
}

interface ChatMessagesViewProps {
  messages: Message[];
  streamEvents?: StreamEvent[];
  isLoading: boolean;
  pendingInterrupt?: InterruptInfo | null;
  onInterruptResume?: (decisions: Array<{ type: 'approve' | 'reject'; message?: string }>) => void;
  onAlwaysAllow?: (toolNames: string[]) => void;
  interruptContent?: React.ReactNode;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  onSubmit: (inputValue: string) => void;
  onRetry?: () => void;
  onCancel: () => void;
  onNewChat?: () => void;
  liveActivityEvents: ProcessedEvent[];
  historicalActivities: Record<string, ProcessedEvent[]>;
  isRateLimited?: boolean;
  rateLimitRemainingSeconds?: number;
  mcpEvents?: Array<{ tool: string; status: string; timestamp: number }>;
  chatId: string;
  traceId: string | null;
  userId?: string;
  messageFeedback?: Record<string, 'up' | 'down'>;
  onEditMessage?: (messageIndex: number, newContent: string) => void;
  lastResponseTiming?: {
    timeToFirstTokenMs: number | null;
    totalDurationMs: number;
  } | null;
  chatInputRef?: React.RefObject<HTMLTextAreaElement | null>;
  onExportMarkdown?: () => void;
  onExportJson?: () => void;
}

export function ChatMessagesView({
  messages,
  isLoading,
  pendingInterrupt,
  onInterruptResume,
  onAlwaysAllow,
  interruptContent,
  scrollAreaRef,
  onSubmit,
  onRetry,
  onCancel,
  onNewChat,
  isRateLimited = false,
  rateLimitRemainingSeconds = 0,
  mcpEvents = [],
  chatId,
  traceId,
  userId,
  messageFeedback = {},
  onEditMessage,
  lastResponseTiming = null,
  chatInputRef,
  onExportMarkdown,
  onExportJson,
}: ChatMessagesViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const prevPendingInterrupt = useRef(pendingInterrupt);

  useEffect(() => {
    if (prevPendingInterrupt.current && !pendingInterrupt) {
      chatInputRef?.current?.focus();
    }
    prevPendingInterrupt.current = pendingInterrupt;
  }, [pendingInterrupt, chatInputRef]);

  const { lastHumanMessageIndex, lastAiMessageIndex } = useMemo(() => {
    let lastHuman = -1;
    let lastAi = -1;
    messages.forEach((m, i) => {
      if (m.type === 'human') lastHuman = i;
      if (m.type === 'ai') lastAi = i;
    });
    return { lastHumanMessageIndex: lastHuman, lastAiMessageIndex: lastAi };
  }, [messages]);

  const lastMessage = messages[messages.length - 1];
  const rawNoResponse = !isLoading && !pendingInterrupt && !interruptContent && messages.length > 0 && lastMessage?.type === 'human';
  const [showNoResponse, setShowNoResponse] = useState(false);

  useEffect(() => {
    if (!rawNoResponse) {
      setShowNoResponse(false);
      return;
    }
    const timer = setTimeout(() => setShowNoResponse(true), 1500);
    return () => clearTimeout(timer);
  }, [rawNoResponse]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const showExport = Boolean(onExportMarkdown && onExportJson && messages.length > 0);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {showExport && (
        <div className="shrink-0 flex justify-end items-center px-4 md:px-6 py-2 border-b border-border bg-background/90">
          <Dropdown
            isOpen={exportMenuOpen}
            onOpenChange={(open) => setExportMenuOpen(open)}
            onSelect={(_event, value) => {
              if (value === 'md') onExportMarkdown?.();
              if (value === 'json') onExportJson?.();
              setExportMenuOpen(false);
            }}
            shouldFocusToggleOnSelect
            toggle={(toggleRef: React.Ref<MenuToggleElement>) => (
              <MenuToggle
                ref={toggleRef}
                variant="plain"
                onClick={() => setExportMenuOpen((o) => !o)}
                isExpanded={exportMenuOpen}
                aria-label="Export conversation"
                icon={<Download className="w-4 h-4" />}
              />
            )}
          >
            <DropdownList>
              <DropdownItem value="md" key="md">
                Export as Markdown
              </DropdownItem>
              <DropdownItem value="json" key="json">
                Export as JSON
              </DropdownItem>
            </DropdownList>
          </Dropdown>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto chat-scroll" ref={scrollAreaRef}>
        <div role="log" aria-label="Chat messages" aria-live="polite" aria-busy={isLoading} className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto pt-8">
          {messages.map((message, messageIndex) => {
            if (message.type === 'tool') {
              return <Fragment key={message.id ?? `m-${messageIndex}`} />;
            }
            const copyText = getCopyableAiMessageText(message.content);
            const showResponseTiming =
              message.type === 'ai' &&
              messageIndex === lastAiMessageIndex &&
              lastResponseTiming != null &&
              !isLoading;

            const isLastAiInTurn =
              message.type === 'ai' &&
              (() => {
                for (let i = messageIndex + 1; i < messages.length; i++) {
                  if (messages[i].type === 'human') return true;
                  if (messages[i].type === 'ai') return false;
                }
                return true;
              })();

            return (
            <div
              key={message.id || `msg-${messageIndex}`}
              role="article"
              aria-label={`Message from ${message.type === 'human' ? 'human' : 'assistant'}`}
              className="animate-fadeInUpSmooth group"
              style={{ animationDelay: `${Math.min(messageIndex * 30, 150)}ms`, opacity: 0 }}
            >
              {message.type === "human" ? (
                <HumanMessageBubble
                  message={message}
                  messageIndex={messageIndex}
                  isLastHuman={messageIndex === lastHumanMessageIndex}
                  isLoading={isLoading}
                  onEditMessage={onEditMessage}
                />
              ) : (
                <div className="w-full space-y-0">
                  <AIMessageRenderer
                    message={message}
                    pendingInterrupt={pendingInterrupt}
                    onInterruptResume={onInterruptResume}
                    onAlwaysAllow={onAlwaysAllow}
                  />
                  {isLastAiInTurn && (
                    <div className="pl-11 flex items-center gap-0.5 mt-1">
                      <MessageCopyButton text={copyText} />
                      <FeedbackButtons
                        messageId={message.id ?? `msg-${messageIndex}`}
                        chatId={chatId}
                        traceId={traceId}
                        userId={userId}
                        existingFeedback={messageFeedback[message.id ?? `msg-${messageIndex}`] ?? null}
                      />
                    </div>
                  )}
                  {showResponseTiming && (
                    <div aria-hidden="true" className="pl-11 mt-1 space-y-0.5 text-muted-foreground">
                      <div className="text-[11px] text-muted-foreground/80">
                        Response time: {(lastResponseTiming.totalDurationMs / 1000).toFixed(1)}s
                      </div>
                      {lastResponseTiming.timeToFirstTokenMs != null && (
                        <div className="text-[10px] text-muted-foreground/65">
                          First token: {Math.round(lastResponseTiming.timeToFirstTokenMs)}ms
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
          })}

          {isLoading && (
            <div
              className="flex items-start gap-3 animate-fadeIn"
              role="status"
              aria-live="assertive"
              aria-label="Agent is thinking"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-full gradient-brand flex items-center justify-center shadow-sm">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-card">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce animation-delay-200" />
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce animation-delay-400" />
                  </span>
                  Thinking...
                </div>
              </div>
            </div>
          )}

          {showNoResponse && (
            <div className="flex items-start gap-3 animate-fadeIn">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-destructive" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-card">
                <p className="text-sm text-muted-foreground mb-2">
                  The agent didn&apos;t respond. This could be a temporary issue.
                </p>
                <button
                  type="button"
                  onClick={() => onRetry?.()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                  aria-label="Retry operation"
                >
                  <RotateCcw className="w-3 h-3" />
                  Retry
                </button>
              </div>
            </div>
          )}
          {interruptContent}
          <div ref={bottomRef} />
        </div>
      </div>
      <TodoStrip messages={messages} isLoading={isLoading} />
      <McpStatusPanel mcpEvents={mcpEvents} />
      <div className="border-t border-border bg-background/80 glass">
        <div className="max-w-3xl mx-auto">
          <InputForm
            ref={chatInputRef}
            onSubmit={onSubmit}
            isLoading={isLoading}
            onCancel={onCancel}
            onNewChat={onNewChat}
            hasHistory={messages.length > 0}
            isRateLimited={isRateLimited}
            rateLimitRemainingSeconds={rateLimitRemainingSeconds}
          />
        </div>
      </div>
    </div>
  );
}
