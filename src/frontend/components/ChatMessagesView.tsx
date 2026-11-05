import type React from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { AlertCircle, Check, CheckCircle, ChevronDown, ChevronRight, Copy, Download, Loader2, Pencil, RotateCcw, Bot, User, ShieldCheck } from "lucide-react";
import type { InterruptInfo } from "../types/deep-agent";
import { InputForm } from "./InputForm";
import { McpStatusPanel } from "./McpStatusPanel";
import { useState, ReactNode, useMemo, useEffect, useRef, useCallback, cloneElement, isValidElement } from "react";
import { cn } from "../lib/utils";
import {
  Dropdown,
  DropdownItem,
  DropdownList,
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
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { markdownSanitizeSchema } from "../lib/markdown-sanitize";
import { isSubAgentToolCall, detectArtifactKind } from "../types/deep-agent";
import { SubAgentIndicator } from "./SubAgentIndicator";
import { ArtifactViewer } from "./ArtifactViewer";
import { McpAppHostFromToolCall } from "./McpAppHost";
import { ChartCard, PlotlyCard, useContentSegments } from "./InlineChart";
import { TodoStrip } from "./TodoStrip";
import { FeedbackButtons, FeedbackCommentBox, useFeedback } from "./FeedbackButtons";
import { CustomDataRenderer } from "./CustomDataRenderer";
import { parseMcpApp } from "../types/mcp-apps";
import { splitMessageParts } from "../../server/message-parts";
import { highlightSubagentMentions, subagentMentionsOf } from "./slash-subagents";

function isRunningToolCall(toolCall: { content?: unknown }): boolean {
  if (toolCall.content == null) return true;
  if (typeof toolCall.content === 'string') return toolCall.content.trim().length === 0;
  return false;
}

function embedQuestion(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;
  return cloneElement(node as React.ReactElement<{ embedded?: boolean }>, { embedded: true });
}

function answeredClarify(toolCall: { name?: string; args?: unknown; content?: unknown }): { question: string; answer: string } | null {
  if (toolCall.name !== 'clarify') return null;
  const args = toolCall.args;
  const question = args && typeof args === 'object' && !Array.isArray(args)
    && typeof (args as { question?: unknown }).question === 'string'
    ? (args as { question: string }).question.trim()
    : '';
  const answer = typeof toolCall.content === 'string' ? toolCall.content.trim() : '';
  if (!answer) return null;
  return { question, answer };
}

function HumanMessageText({ text, names }: { text: string; names: string[] }) {
  const parts = highlightSubagentMentions(text, names);
  if (!parts.some((part) => part.marked)) {
    return (
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]} components={mdComponents}>
        {text}
      </ReactMarkdown>
    );
  }
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, index) =>
        part.marked ? (
          <strong key={index} className="font-semibold underline">{part.text}</strong>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </span>
  );
}

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
    /<think>([\s\S]*?)<\/think>/gi,
    /<thinking>([\s\S]*?)<\/thinking>/gi,
  ];
  for (const re of patterns) {
    display = display.replace(re, (_full, inner: string) => {
      thinkingParts.push(String(inner).trim());
      return '';
    });
  }
  display = display.replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, '');
  const redactedOpen = display.search(/<redacted_thinking/i);
  if (redactedOpen !== -1) {
    display = display.slice(0, redactedOpen);
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
  const main = markdownForDisplay
    || (thinkingText ? '' : (typeof content === 'string' ? '' : extractMessageText(content)));
  const body = thinkingText
    ? [thinkingText, main].filter((s) => s.length > 0).join('\n\n')
    : main;
  if (!body?.trim()) return '';
  return `${body}\n\n[AI-generated]`;
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

function MessageActionsRow({
  isLastAiInTurn,
  copyText,
  messageId,
  chatId,
  traceId,
  userId,
  existingFeedback,
}: {
  isLastAiInTurn: boolean;
  copyText: string;
  messageId: string;
  chatId: string;
  traceId: string | null;
  userId?: string;
  existingFeedback: 'up' | 'down' | null;
}) {
  const fb = useFeedback({ messageId, traceId, chatId, userId, existingFeedback });

  return (
    <>
      <div className="pl-11 flex items-center gap-0.5 mt-1">
        {isLastAiInTurn && (
          <>
            <MessageCopyButton text={copyText} />
            <FeedbackButtons fb={fb} />
          </>
        )}
        <span className="inline-flex items-center gap-1 ml-2 text-[11px] text-muted-foreground" aria-label="AI-generated content">
          <Bot className="w-2.5 h-2.5" aria-hidden="true" />
          AI-generated
        </span>
      </div>
      {isLastAiInTurn && <FeedbackCommentBox fb={fb} />}
    </>
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
  p: ({ className, children, node: _node, ...props }: MdComponentProps) => (
    <p className={cn("mb-3 leading-7 text-inherit", className)} {...props}>
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
        <span className="sr-only"> (opens in new tab)</span>
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
  li: ({ className, children, node: _node, ...props }: MdComponentProps) => (
    <li className={cn("mb-1 text-inherit", className)} {...props}>
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
  img: () => null,
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
      <div className={cn("flex flex-col items-end", isEditing ? "w-full sm:w-[75%]" : "max-w-[85%] sm:max-w-[75%]")}>
        <div
          className={cn(
            "relative rounded-2xl rounded-br-sm break-words px-4 py-3 bg-primary text-primary-foreground shadow-card",
            isEditing ? "w-full" : "w-fit",
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
            <div className="text-sm leading-relaxed [&_p]:!mb-1.5 [&_p:last-child]:!mb-0">
              <HumanMessageText text={plain} names={subagentMentionsOf(message)} />
            </div>
          )}
        </div>
        {!isEditing && (
          <div className="mt-2 opacity-0 transition-opacity group-hover/msg:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
            <MessageCopyButton text={plain} />
            <button
              type="button"
              onClick={() => startEdit()}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground/70 hover:bg-muted/40 hover:text-muted-foreground disabled:pointer-events-none disabled:opacity-40"
              aria-label="Edit message"
              disabled={!canEdit}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
        <User className="w-4 h-4 text-primary" />
      </div>
    </div>
  );
};

function currentTurnMessages(messages: Message[]): Message[] {
  let start = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'human') {
      start = i + 1;
      break;
    }
  }
  return messages.slice(start);
}

function visibleToolCalls(message: Message): Array<{ id?: string; name: string; content?: unknown; status?: string }> {
  const calls = (message as { tool_calls?: Array<{ id?: string; name?: string; content?: unknown; status?: string }> }).tool_calls;
  if (!Array.isArray(calls)) return [];
  return calls.filter((tc): tc is { id?: string; name: string; content?: unknown; status?: string } =>
    typeof tc?.name === 'string' && tc.name.length > 0 && tc.name !== 'write_todos');
}

/** Status under the transcript for the question being answered now. */
function CurrentTurnStatus({ messages }: { messages: Message[] }) {
  const turn = currentTurnMessages(messages);
  const steps: Array<{ key: string; label: string; status: 'done' | 'running' | 'error' }> = [];
  let anyRunning = false;
  for (const message of turn) {
    if (message.type !== 'ai') continue;
    visibleToolCalls(message).forEach((toolCall, index) => {
      const running = toolCall.content == null;
      if (running) anyRunning = true;
      steps.push({
        key: toolCall.id ?? `${message.id ?? 'tool'}-${index}`,
        label: toolCall.name,
        status: toolCall.status === 'error' ? 'error' : running ? 'running' : 'done',
      });
    });
  }
  if (steps.length > 0 && !anyRunning) {
    steps.push({ key: 'synthesizing', label: 'Synthesizing answer...', status: 'running' });
  }

  if (steps.length === 0) {
    return (
      <div className="flex items-start gap-3 animate-fadeIn" role="status" aria-live="polite">
        <div className="flex-shrink-0 w-7 h-7 rounded-full gradient-brand flex items-center justify-center shadow-sm">
          <Bot className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" aria-hidden="true" />
          Thinking...
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 animate-fadeIn" role="status" aria-live="polite">
      <div className="flex-shrink-0 w-7 h-7 mt-0.5 rounded-full gradient-brand flex items-center justify-center shadow-sm">
        <Bot className="w-3.5 h-3.5 text-white" />
      </div>
      <div className="flex-1 min-w-0 py-1">
        <div className="space-y-1.5">
          {steps.map((step) => (
            <div key={step.key} className="flex items-center gap-2 text-xs">
              {step.status === 'error' ? (
                <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" aria-hidden="true" />
              ) : step.status === 'done' ? (
                <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" aria-hidden="true" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" aria-hidden="true" />
              )}
              <span className={step.status === 'done' ? 'text-muted-foreground/60' : 'text-foreground/80 font-medium'}>
                {step.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function isThinkingLive(message: Message, isLoading: boolean, isLastAi: boolean): boolean {
  if (!isLoading || !isLastAi) return false;
  const tools = (message as { tool_calls?: unknown }).tool_calls;
  if (Array.isArray(tools) && tools.length > 0) return false;
  const stored = (message as { thinking?: unknown }).thinking;
  const parts = splitMessageParts(message);
  const thinking = typeof stored === 'string' && stored.trim().length > 0 ? stored : parts.thinking;
  if (thinking.trim().length === 0) return false;
  return parts.answer.trim().length === 0;
}

export interface TurnToolCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
  content?: unknown;
  status?: string;
  mcpApp?: unknown;
}

export type TurnThoughtItem =
  | { kind: 'thinking'; text: string }
  | { kind: 'tools'; tools: TurnToolCall[] };

export type TurnSegment =
  | { type: 'thought'; items: TurnThoughtItem[] }
  | { type: 'stream'; text: string };

function messagePieces(message: Message): Array<
  | { kind: 'thinking'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'tools'; tools: TurnToolCall[] }
> {
  const stored = (message as { thinking?: unknown }).thinking;
  const parts = splitMessageParts(message);
  const thinking = typeof stored === 'string' && stored.length > 0 ? stored : parts.thinking;
  const pieces: Array<
    | { kind: 'thinking'; text: string }
    | { kind: 'text'; text: string }
    | { kind: 'tools'; tools: TurnToolCall[] }
  > = [];
  if (thinking.trim()) pieces.push({ kind: 'thinking', text: thinking });
  if (parts.answer.trim()) pieces.push({ kind: 'text', text: parts.answer });
  const calls = (message as { tool_calls?: TurnToolCall[] }).tool_calls;
  const tools = Array.isArray(calls)
    ? calls.filter((tc) => tc && tc.name !== 'write_todos' && !(tc.name === 'clarify' && !answeredClarify(tc)))
    : [];
  if (tools.length > 0) pieces.push({ kind: 'tools', tools });
  return pieces;
}

/** Sentence stays outside. Later thoughts and tool calls stay in one block, in arrival order. */
export function buildTurnSegments(messages: Message[]): TurnSegment[] {
  const pieces: Array<
    | { kind: 'thinking'; text: string }
    | { kind: 'text'; text: string }
    | { kind: 'tools'; tools: TurnToolCall[] }
  > = [];
  const toolListById = new Map<string, TurnToolCall[]>();
  const toolIndexById = new Map<string, number>();
  for (const message of messages) {
    if (message.type !== 'ai') continue;
    for (const piece of messagePieces(message)) {
      if (piece.kind !== 'tools') {
        pieces.push(piece);
        continue;
      }
      const tools: TurnToolCall[] = [];
      for (const tool of piece.tools) {
        if (!tool.id) {
          tools.push(tool);
          continue;
        }
        const previous = toolListById.get(tool.id);
        if (previous) {
          previous[toolIndexById.get(tool.id) ?? 0] = tool;
          continue;
        }
        toolListById.set(tool.id, tools);
        toolIndexById.set(tool.id, tools.length);
        tools.push(tool);
      }
      if (tools.length > 0) pieces.push({ kind: 'tools', tools });
    }
  }
  const segments: TurnSegment[] = [];
  let pending: TurnThoughtItem[] | null = null;
  const flush = () => {
    if (pending && pending.length > 0) segments.push({ type: 'thought', items: pending });
    pending = null;
  };
  for (const piece of pieces) {
    if (piece.kind === 'text') {
      flush();
      segments.push({ type: 'stream', text: piece.text });
      continue;
    }
    if (!pending) pending = [];
    if (piece.kind === 'thinking') pending.push({ kind: 'thinking', text: piece.text });
    else pending.push({ kind: 'tools', tools: piece.tools });
  }
  flush();
  return segments;
}

export function turnEndsInThought(messages: Message[]): boolean {
  return buildTurnSegments(messages).at(-1)?.type === 'thought';
}

function regularToolsInTurn(messages: Message[]): TurnToolCall[] {
  const tools: TurnToolCall[] = [];
  for (const segment of buildTurnSegments(messages)) {
    if (segment.type !== 'thought') continue;
    for (const item of segment.items) {
      if (item.kind !== 'tools') continue;
      for (const tool of item.tools) {
        if (isSubAgentToolCall(tool)) continue;
        if (answeredClarify(tool)) continue;
        tools.push(tool);
      }
    }
  }
  return tools;
}

function regularToolId(tool: TurnToolCall, index: number): string {
  return `${tool.id ?? tool.name}-${index}`;
}

function isEarlierAiInTurn(messages: Message[], index: number): boolean {
  if (messages[index]?.type !== 'ai') return false;
  for (let i = index + 1; i < messages.length; i++) {
    if (messages[i].type === 'human') return false;
    if (messages[i].type === 'ai') return true;
  }
  return false;
}

function turnStartIndex(messages: Message[], index: number): number {
  for (let i = index; i >= 0; i--) {
    if (messages[i].type === 'human') return i + 1;
  }
  return 0;
}

function turnArticleKey(messages: Message[], index: number): string {
  if (messages[index]?.type !== 'ai') return messages[index]?.id || `msg-${index}`;
  const start = turnStartIndex(messages, index);
  for (let i = start; i <= index; i++) {
    if (messages[i].type === 'ai' && messages[i].id) return `turn-${messages[i].id}`;
  }
  return messages[index]?.id || `turn-${index}`;
}

interface AIMessageRendererProps {
  message: Message;
  pendingInterrupt?: InterruptInfo | null;
  onInterruptResume?: (decisions: Array<{ type: 'approve' | 'reject'; message?: string }>) => void;
  onAlwaysAllow?: (toolNames: string[]) => void;
  globalApprovalIndex?: number;
  approvalSlotOffset?: number;
  totalActionRequests?: number;
  allDecisionsMade?: boolean;
  onSingleDecision?: (decision: { type: 'approve' | 'reject'; message?: string }) => void;
  thinkingLive?: boolean;
  questionContent?: ReactNode;
  interruptContent?: ReactNode;
  turnMessages?: Message[];
}

function AnswerStream({ text }: { text: string }) {
  const parts = useContentSegments(text);
  return (
    <div className="ai-response-body">
      {parts.map((part, index) => {
        if (part.kind === 'plotly') return <PlotlyCard key={index} spec={part.spec} />;
        if (part.kind === 'chart') return <ChartCard key={index} spec={part.spec} />;
        return (
          <div key={index} className="max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]} components={mdComponents}>{part.text}</ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}

function toolQueryHint(tool: TurnToolCall): string | null {
  const query = tool.args?.query;
  if (typeof query !== 'string' || query.trim().length === 0) return null;
  const trimmed = query.trim();
  return trimmed.length > 50 ? `${trimmed.slice(0, 47)}...` : trimmed;
}

export function AIMessageRenderer({ message, pendingInterrupt, onInterruptResume, onAlwaysAllow, globalApprovalIndex = 0, approvalSlotOffset = 0, totalActionRequests = 0, allDecisionsMade = false, onSingleDecision, thinkingLive = false, questionContent, interruptContent, turnMessages }: AIMessageRendererProps) {
  const source = turnMessages && turnMessages.length > 0 ? turnMessages : [message];
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [thoughtChoice, setThoughtChoice] = useState<Record<number, boolean>>({});
  const messageKey = JSON.stringify(source);

  const userExpandedRef = useRef<Set<string>>(new Set());
  const userCollapsedRef = useRef<Set<string>>(new Set());

  const pendingToolNames = useMemo(
    () => {
      const v = pendingInterrupt?.value;
      const requests = (typeof v === 'object' && v !== null) ? (v.action_requests ?? []) : [];
      return new Set(requests.map((r) => r.name));
    },
    [pendingInterrupt],
  );

  const segments = useMemo(() => buildTurnSegments(source), [messageKey]);
  const regularTools = useMemo(() => regularToolsInTurn(source), [messageKey]);

  useEffect(() => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      let changed = false;
      regularTools.forEach((tc, idx) => {
        const itemId = regularToolId(tc, idx);
        const needsApproval = (pendingToolNames.has(tc.name) || pendingToolNames.has('task')) && tc.content == null;
        const isFinished = tc.content != null;
        if (needsApproval && !next.has(itemId) && !userCollapsedRef.current.has(itemId)) {
          next.add(itemId);
          changed = true;
        } else if (isFinished && next.has(itemId) && !userExpandedRef.current.has(itemId)) {
          next.delete(itemId);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [pendingToolNames, messageKey, regularTools]);

  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (prev.has(itemId)) {
        next.delete(itemId);
        userExpandedRef.current.delete(itemId);
        userCollapsedRef.current.add(itemId);
      } else {
        next.add(itemId);
        userCollapsedRef.current.delete(itemId);
        userExpandedRef.current.add(itemId);
      }
      return next;
    });
  };

  const approvalSlotByToolCallId = useMemo(() => {
    const map = new Map<string, number>();
    let localSlot = 0;
    for (const turnMessage of source) {
      const calls = (turnMessage as { tool_calls?: TurnToolCall[] }).tool_calls ?? [];
      for (const tc of calls) {
        if (tc.name === 'write_todos') continue;
        const isApprovable = (pendingToolNames.has(tc.name) || pendingToolNames.has('task')) && tc.content == null;
        if (isApprovable) {
          const key = tc.id ?? `${tc.name}-${localSlot}`;
          map.set(key, approvalSlotOffset + localSlot);
          localSlot++;
        }
      }
    }
    return map;
  }, [messageKey, pendingToolNames, approvalSlotOffset]);

  const renderMessage = useMemo(() => {
    const customRaw = (message as Record<string, unknown>).custom_data;
    const customData =
      customRaw != null && typeof customRaw === 'object' && !Array.isArray(customRaw)
        ? (customRaw as Record<string, unknown>)
        : null;
    if (segments.length === 0 && !customData) return null;

    const lastSegmentIndex = segments.length - 1;
    const attention = interruptContent ?? null;
    const regularIndexByPath = new Map<string, number>();
    let runningSubagentKey: string | null = null;
    let regularCount = 0;
    segments.forEach((segment, segmentIndex) => {
      if (segment.type !== 'thought') return;
      segment.items.forEach((item, itemIndex) => {
        if (item.kind !== 'tools') return;
        item.tools.forEach((tool, toolIndex) => {
          const path = `${segmentIndex}-${itemIndex}-${toolIndex}`;
          if (isSubAgentToolCall(tool)) {
            if (isRunningToolCall(tool)) runningSubagentKey = path;
            return;
          }
          if (answeredClarify(tool)) return;
          regularIndexByPath.set(path, regularCount);
          regularCount += 1;
        });
      });
    });

    const renderRegularTool = (toolCall: TurnToolCall, idx: number) => {
      const itemId = regularToolId(toolCall, idx);
      const isExpanded = expandedItems.has(itemId);
      const needsApproval = (pendingToolNames.has(toolCall.name) || pendingToolNames.has('task')) && toolCall.content == null;
      const regTcId = toolCall.id ?? `${toolCall.name}-${idx}`;
      const regSlot = approvalSlotByToolCallId.get(regTcId);
      const isThisCurrentApproval = regSlot !== undefined && regSlot === globalApprovalIndex && !allDecisionsMade;
      const showButtons = totalActionRequests <= 1 ? needsApproval : (needsApproval && isThisCurrentApproval);
      const mcpAppDesc = parseMcpApp(toolCall.mcpApp);
      const hasMcpApp = Boolean(mcpAppDesc);
      const failed = toolCall.status === 'error';
      const queryHint = toolQueryHint(toolCall);

      return (
        <div
          key={itemId}
          className={cn(
            "border rounded-lg overflow-hidden bg-card/50",
            needsApproval ? "border-yellow-500/60" : "border-border/40",
          )}
        >
          <button
            type="button"
            onClick={() => toggleExpand(itemId)}
            aria-expanded={isExpanded}
            aria-controls={`tool-body-${itemId}`}
            aria-label={`${isExpanded ? 'Collapse' : 'Expand'} tool call: ${toolCall.name}`}
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
              {hasMcpApp && !isExpanded && (
                <span className="text-[11px] text-muted-foreground/70">Click to open UI</span>
              )}
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" aria-hidden="true" />
              ) : (
                <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" aria-hidden="true" />
              )}
            </span>
          </button>

          {isExpanded && (
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
                      "text-[10px] font-medium mb-1 mt-2 uppercase tracking-wider",
                      failed ? "text-red-500/70" : "text-muted-foreground/50",
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

          {showButtons && onInterruptResume && (
            <div role="alert" aria-live="assertive" aria-label={`Tool call ${toolCall.name} requires approval`} className="flex items-center gap-2 px-3 py-2 border-t border-yellow-500/30 bg-yellow-500/5 flex-wrap">
              <button
                type="button"
                autoFocus
                onClick={() => {
                  if (totalActionRequests > 1 && onSingleDecision) {
                    onSingleDecision({ type: 'approve' });
                  } else {
                    onInterruptResume?.([{ type: 'approve' }]);
                  }
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
                  if (totalActionRequests > 1 && onSingleDecision) {
                    onSingleDecision({ type: 'reject', message: 'User rejected this action.' });
                  } else {
                    onInterruptResume?.([{ type: 'reject', message: 'User rejected this action.' }]);
                  }
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
                  onAlwaysAllow?.([toolCall.name]);
                  if (totalActionRequests > 1 && onSingleDecision) {
                    onSingleDecision({ type: 'approve' });
                  } else {
                    onInterruptResume?.([{ type: 'approve' }]);
                  }
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
      );
    };

    const gutter = (segmentIndex: number) => (
      <div className="w-8 shrink-0">
        {segmentIndex === 0 && (
          <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center shadow-sm">
            <Bot className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
    );

    return (
      <div className="space-y-2 w-full">
          {segments.map((segment, segmentIndex) => {
            if (segment.type === 'stream') {
              return (
                <div key={`stream-${segmentIndex}`} className="flex items-start gap-3">
                  {gutter(segmentIndex)}
                  <div className="flex-1 min-w-0">
                    <AnswerStream text={segment.text} />
                  </div>
                </div>
              );
            }

            const toolCount = segment.items.reduce((count, item) => {
              if (item.kind !== 'tools') return count;
              return count + item.tools.filter((tool) => !answeredClarify(tool)).length;
            }, 0);
            const needsAttention = segment.items.some((item) =>
              item.kind === 'tools' && item.tools.some((tool) =>
                (pendingToolNames.has(tool.name) || pendingToolNames.has('task')) && tool.content == null,
              ),
            );
            const holdsAttention = segmentIndex === lastSegmentIndex && Boolean(attention || questionContent);
            const forcedOpen = needsAttention || holdsAttention;
            const open = forcedOpen || (thoughtChoice[segmentIndex] ?? segmentIndex === lastSegmentIndex);
            const liveLabel = thinkingLive && segmentIndex === lastSegmentIndex && open;

            return (
              <div key={`thought-${segmentIndex}`} className="flex items-start gap-3">
                {gutter(segmentIndex)}
                <div className="flex-1 min-w-0">
                <button
                  type="button"
                  className="flex items-center gap-1.5 px-1 py-1 text-left text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  aria-expanded={open}
                  onClick={() => {
                    if (forcedOpen) return;
                    setThoughtChoice((prev) => ({ ...prev, [segmentIndex]: !open }));
                  }}
                >
                  {open
                    ? <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
                    : <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />}
                  <span className={cn('text-xs', liveLabel ? 'animate-pulse' : 'italic')}>
                    {liveLabel ? 'Thinking...' : 'Thought process'}
                    {!liveLabel && toolCount > 0 && (
                      <span className="text-muted-foreground/40 ml-1">
                        · {toolCount} tool call{toolCount === 1 ? '' : 's'}
                      </span>
                    )}
                  </span>
                </button>
                {open && (
                  <div className="ml-1 pl-3 border-l-2 border-muted-foreground/15 space-y-2">
                    {segment.items.map((item, itemIndex) => {
                      if (item.kind === 'thinking') {
                        return (
                          <div key={`think-${itemIndex}`} className="text-[13px] leading-relaxed text-muted-foreground/60 italic [&_strong]:font-medium [&_strong]:text-muted-foreground/70 [&_p]:mb-1.5 [&_p:last-child]:mb-0">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.text}</ReactMarkdown>
                          </div>
                        );
                      }
                      return (
                        <div key={`tools-${itemIndex}`} className="space-y-2">
                          {item.tools.map((toolCall, toolIndex) => {
                            if (isSubAgentToolCall(toolCall)) {
                              const key = `${segmentIndex}-${itemIndex}-${toolIndex}`;
                              const tcId = toolCall.id ?? `${toolCall.name}-${toolIndex}`;
                              const slot = approvalSlotByToolCallId.get(tcId);
                              const isThisCurrent = slot !== undefined && slot === globalApprovalIndex && !allDecisionsMade;
                              return (
                                <SubAgentIndicator
                                  key={key}
                                  toolCall={{
                                    name: toolCall.name,
                                    args: toolCall.args ?? {},
                                    id: toolCall.id ?? `${toolCall.name}-${toolIndex}`,
                                    content: toolCall.content,
                                  }}
                                  messageId={message.id ?? ''}
                                  index={toolIndex}
                                  pendingInterrupt={pendingInterrupt}
                                  onInterruptResume={onInterruptResume}
                                  onSingleDecision={totalActionRequests > 1 ? onSingleDecision : undefined}
                                  isCurrentApproval={totalActionRequests > 1 ? isThisCurrent : undefined}
                                  onAlwaysAllow={onAlwaysAllow}
                                  question={questionContent && key === runningSubagentKey ? embedQuestion(questionContent) : undefined}
                                />
                              );
                            }
                            const exchange = answeredClarify(toolCall);
                            if (exchange) {
                              return (
                                <div key={`${segmentIndex}-ask-${toolIndex}`} className="bg-card border border-border rounded-xl px-4 py-3 text-sm" role="group" aria-label="Answered question">
                                  {exchange.question && <p className="font-medium text-foreground">{exchange.question}</p>}
                                  <p className={exchange.question ? 'mt-1 text-muted-foreground' : 'text-muted-foreground'}>{exchange.answer}</p>
                                </div>
                              );
                            }
                            return renderRegularTool(toolCall, regularIndexByPath.get(`${segmentIndex}-${itemIndex}-${toolIndex}`) ?? 0);
                          })}
                        </div>
                      );
                    })}
                    {segmentIndex === lastSegmentIndex && attention}
                  </div>
                )}
                </div>
              </div>
            );
          })}
          {lastSegmentIndex >= 0 && segments[lastSegmentIndex]?.type !== 'thought' && attention}
          {customData && (
            <div className="w-full mt-2">
              <CustomDataRenderer data={customData} />
            </div>
          )}
      </div>
    );
  // The segment list is derived from messageKey, so the render follows that snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageKey, expandedItems, thoughtChoice, globalApprovalIndex, allDecisionsMade, pendingInterrupt, onInterruptResume, onAlwaysAllow, onSingleDecision, totalActionRequests, approvalSlotByToolCallId, thinkingLive, questionContent, interruptContent, pendingToolNames]);

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
  errorMessage?: string | null;
  onCancel: () => void;
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
  chatInputRef?: React.RefObject<HTMLDivElement | null>;
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
  errorMessage,
  onCancel,
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
  const prevIsLoading = useRef(isLoading);
  const [srAnnouncement, setSrAnnouncement] = useState('');

  const globalActionRequests = useMemo(() => {
    const v = pendingInterrupt?.value;
    return (typeof v === 'object' && v !== null) ? ((v as any).action_requests ?? []) : [];
  }, [pendingInterrupt]);

  const [globalDecisions, setGlobalDecisions] = useState<Array<{ type: 'approve' | 'reject'; message?: string } | null>>([]);
  const [globalApprovalIndex, setGlobalApprovalIndex] = useState(0);

  useEffect(() => {
    if (globalActionRequests.length > 0) {
      setGlobalDecisions(new Array(globalActionRequests.length).fill(null));
      setGlobalApprovalIndex(0);
    }
  }, [globalActionRequests]);

  const globalAllDecisionsMade = globalActionRequests.length > 0 && globalDecisions.every(d => d !== null);

  const handleGlobalSingleDecision = useCallback((decision: { type: 'approve' | 'reject'; message?: string }) => {
    const newDecisions = [...globalDecisions];
    newDecisions[globalApprovalIndex] = decision;
    setGlobalDecisions(newDecisions);

    const nextIndex = globalApprovalIndex + 1;
    if (nextIndex >= globalActionRequests.length) {
      onInterruptResume?.(newDecisions.filter(Boolean) as Array<{ type: 'approve' | 'reject'; message?: string }>);
    } else {
      setGlobalApprovalIndex(nextIndex);
    }
  }, [globalDecisions, globalApprovalIndex, globalActionRequests.length, onInterruptResume]);

  const pendingToolNames = useMemo(() => {
    const requests = globalActionRequests;
    return new Set(requests.map((r: any) => r.name));
  }, [globalActionRequests]);

  const approvalSlotOffsets = useMemo(() => {
    const offsets = new Map<number, number>();
    let runningOffset = 0;
    messages.forEach((m, idx) => {
      offsets.set(idx, runningOffset);
      if (m.type === 'ai' && Array.isArray((m as any).tool_calls)) {
        for (const tc of (m as any).tool_calls) {
          if (tc.name === 'write_todos') continue;
          const isApprovable = (pendingToolNames.has(tc.name) || pendingToolNames.has('task')) && !(tc as Record<string, unknown>).content;
          if (isApprovable) runningOffset++;
        }
      }
    });
    return offsets;
  }, [messages, pendingToolNames]);

  useEffect(() => {
    if (prevPendingInterrupt.current && !pendingInterrupt) {
      chatInputRef?.current?.focus();
    }
    prevPendingInterrupt.current = pendingInterrupt;
  }, [pendingInterrupt, chatInputRef]);

  useEffect(() => {
    const wasLoading = prevIsLoading.current;
    prevIsLoading.current = isLoading;
    if (!wasLoading || isLoading) return;
    const lastAiMessage = [...messages].reverse().find((m) => m.type === 'ai');
    if (!lastAiMessage) return;
    const { markdownForDisplay } = partitionMessageContent(lastAiMessage.content);
    const text = markdownForDisplay
      || (typeof lastAiMessage.content === 'string' ? '' : extractMessageText(lastAiMessage.content));
    if (!text?.trim()) return;
    setSrAnnouncement('');
    const id = setTimeout(() => setSrAnnouncement(text), 50);
    return () => clearTimeout(id);
  }, [isLoading, messages]);

  const { lastHumanMessageIndex, lastAiMessageIndex } = useMemo(() => {
    let lastHuman = -1;
    let lastAi = -1;
    messages.forEach((m, i) => {
      if (m.type === 'human') lastHuman = i;
      if (m.type === 'ai') lastAi = i;
    });
    return { lastHumanMessageIndex: lastHuman, lastAiMessageIndex: lastAi };
  }, [messages]);

  const questionNestMessageIndex = useMemo(() => {
    let parentAsking = false;
    let onlyIndex = -1;
    let runningCount = 0;
    messages.forEach((message, index) => {
      if (message.type !== 'ai' || !Array.isArray(message.tool_calls)) return;
      for (const toolCall of message.tool_calls) {
        const call = toolCall as { name?: string; args?: Record<string, unknown>; content?: unknown };
        if (!isRunningToolCall(call)) continue;
        if (call.name === 'clarify') parentAsking = true;
        if (isSubAgentToolCall(call as { name: string; args?: Record<string, unknown> })) {
          runningCount += 1;
          onlyIndex = index;
        }
      }
    });
    if (parentAsking || runningCount !== 1) return -1;
    return onlyIndex;
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
  }, [messages, interruptContent]);

  const showExport = Boolean(onExportMarkdown && onExportJson && messages.length > 0);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {srAnnouncement}
      </div>
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
        <div role="log" aria-label="Chat messages" aria-live="off" aria-busy={isLoading} className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto pt-8">
          {messages.map((message, messageIndex) => {
            if (message.type === 'tool' || isEarlierAiInTurn(messages, messageIndex)) {
              return null;
            }
            const turnStart = turnStartIndex(messages, messageIndex);
            const turnMessages = message.type === 'ai' ? messages.slice(turnStart, messageIndex + 1) : [message];
            const copyText = message.type === 'ai'
              ? buildTurnSegments(turnMessages).flatMap((segment) => segment.type === 'stream' ? [segment.text] : []).join('\n\n')
                || getCopyableAiMessageText(message.content)
              : getCopyableAiMessageText(message.content);
            const ownsInterrupt = message.type === 'ai'
              && messageIndex === lastAiMessageIndex
              && Boolean(interruptContent)
              && questionNestMessageIndex < 0;
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
              key={turnArticleKey(messages, messageIndex)}
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
                    globalApprovalIndex={globalApprovalIndex}
                    approvalSlotOffset={approvalSlotOffsets.get(turnStart) ?? 0}
                    totalActionRequests={globalActionRequests.length}
                    allDecisionsMade={globalAllDecisionsMade}
                    onSingleDecision={handleGlobalSingleDecision}
                    thinkingLive={isThinkingLive(message, isLoading, messageIndex === lastAiMessageIndex)}
                    questionContent={messageIndex === questionNestMessageIndex ? interruptContent : undefined}
                    interruptContent={ownsInterrupt ? interruptContent : undefined}
                    turnMessages={message.type === 'ai' ? turnMessages : undefined}
                  />
                  {ownsInterrupt ? null : (
                    <MessageActionsRow
                      isLastAiInTurn={isLastAiInTurn}
                      copyText={copyText}
                      messageId={message.id ?? `msg-${messageIndex}`}
                      chatId={chatId}
                      traceId={traceId}
                      userId={userId}
                      existingFeedback={messageFeedback[message.id ?? `msg-${messageIndex}`] ?? null}
                    />
                  )}
                  {showResponseTiming && (
                    <div aria-hidden="true" className="pl-11 mt-1 space-y-0.5 text-muted-foreground">
                      <div className="text-[11px] text-muted-foreground">
                        Response time: {(lastResponseTiming.totalDurationMs / 1000).toFixed(1)}s
                      </div>
                      {lastResponseTiming.timeToFirstTokenMs != null && (
                        <div className="text-[10px] text-muted-foreground">
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

          {isLoading && <CurrentTurnStatus messages={messages} />}

          {showNoResponse && (
            <div className="flex items-start gap-3 animate-fadeIn">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-destructive" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-card max-w-lg">
                <p className="text-sm text-muted-foreground mb-1">
                  {errorMessage
                    ? 'The agent encountered an error:'
                    : 'The agent didn\u0027t respond. This could be a temporary issue.'}
                </p>
                {errorMessage && (
                  <p className="text-sm text-destructive bg-destructive/5 rounded-md px-2 py-1.5 mb-2 font-mono text-xs break-words">
                    {errorMessage}
                  </p>
                )}
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
          {!showNoResponse && errorMessage && !isLoading && (
            <div className="flex items-start gap-3 animate-fadeIn">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center">
                <AlertCircle className="w-4 h-4 text-destructive" />
              </div>
              <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-card max-w-lg">
                <p className="text-sm text-muted-foreground mb-1">The agent encountered an error:</p>
                <p className="text-sm text-destructive bg-destructive/5 rounded-md px-2 py-1.5 mb-2 font-mono text-xs break-words">
                  {errorMessage}
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
          {lastAiMessageIndex < 0 && questionNestMessageIndex < 0 && interruptContent}
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
            isRateLimited={isRateLimited}
            rateLimitRemainingSeconds={rateLimitRemainingSeconds}
          />
        </div>
      </div>
    </div>
  );
}
