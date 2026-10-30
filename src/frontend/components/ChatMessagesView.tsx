import React from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { AlertCircle, Check, CheckCircle, ChevronDown, ChevronRight, Copy, Download, Loader2, Pencil, RotateCcw, Settings, Bot, User, ShieldCheck } from "lucide-react";
import type { InterruptInfo } from "../types/deep-agent";
import { InputForm } from "./InputForm";
import { McpStatusPanel } from "./McpStatusPanel";
import { useState, ReactNode, useMemo, useEffect, useRef, useCallback, Fragment, cloneElement, isValidElement } from "react";
import { cn } from "../lib/utils";
import {
  Dropdown,
  DropdownItem,
  DropdownList,
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
import { NativeChartViewer, extractPlotlyFigure, extractChartMeta } from "./NativeChartViewer";
import { BookOpen } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import { setChunks, selectChunk, selectPanelOpen, type ReferenceChunk } from '../redux/slices/references';
import { ReferencesPanel } from './ReferencesPanel';
import { useContentSegments, ChartCard, PlotlyCard } from './InlineChart';
import { TodoStrip } from "./TodoStrip";
import { FeedbackButtons, FeedbackCommentBox, useFeedback } from "./FeedbackButtons";
import { CustomDataRenderer } from "./CustomDataRenderer";
import { parseMcpApp } from "../types/mcp-apps";
import { splitMessageParts } from "../../server/message-parts";

function isRunningToolCall(toolCall: { content?: unknown }): boolean {
  if (toolCall.content == null) return true;
  if (typeof toolCall.content === 'string') return toolCall.content.trim().length === 0;
  return false;
}

/**
 * Detect standalone title-case lines (preceded+followed by blank line, no ending
 * period, short) and promote them to ## headings so they render as actual headings.
 * The model often omits the `## ` prefix despite prompt instructions.
 */
function promoteHeadings(md: string): string {
  return md.replace(
    /(?:^|\n\n)([ \t]*(?:---[ \t]*\n\n)?)(([A-Z][A-Za-z0-9\s&:,/()\u2013\u2014-]{1,78}))\n\n/g,
    (_match, prefix, _full, title) => {
      const t = title.trim();
      if (t.endsWith('.') || t.endsWith(',') || t.endsWith(';')) return _match;
      if (t.startsWith('#') || t.startsWith('|') || t.startsWith('>') || t.startsWith(':::')) return _match;
      const wordCount = t.split(/\s+/).length;
      if (wordCount > 10) return _match;
      return `\n\n${prefix}## ${t}\n\n`;
    }
  );
}

/**
 * Convert a single "Doc Name, p.X" match into a markdown cite link.
 */
function makeCiteLink(doc: string, page: string, wrap?: string): string {
  const d = doc.trim();
  const encodedDoc = encodeURIComponent(d);
  const label = wrap ? `${wrap}${d}, p.${page}${wrap === '(' ? ')' : ''}` : `${d}, p.${page}`;
  return `[${label}](#cite~${encodedDoc}~${page})`;
}

/**
 * Wrap citations in clickable markdown links.
 * Handles: (Doc, p.X), (Doc1, p.X; Doc2, p.Y), and bare Doc, p.X in table cells.
 */
function linkifyCitations(md: string): string {
  const CITE_SINGLE = /([^();]{3,60}?),\s*p\.?\s*(\d+)/;

  return md
    .replace(/\(([^()]+)\)/g, (paren, inner: string) => {
      if (!CITE_SINGLE.test(inner)) return paren;
      const parts = inner.split(';').map(s => s.trim());
      const linked = parts.map(part => {
        const m = part.match(/^(.+?),\s*p\.?\s*(\d+)$/);
        if (!m) return part;
        return makeCiteLink(m[1], m[2]);
      });
      return `(${linked.join('; ')})`;
    })
    .replace(
      /\|\s*([^|]{3,70}?)\s*\|\s*(p\.?\s*\d+(?:\s*,\s*p\.?\s*\d+)*)\s*\|/g,
      (_match, doc, pagesRaw) => {
        const d = doc.trim();
        if (!d || /^[\d$#\-*]+$/.test(d) || d.startsWith('[')) return _match;
        const firstPage = pagesRaw.match(/\d+/)?.[0] ?? '1';
        const link = makeCiteLink(d, firstPage);
        return `| ${link} | ${pagesRaw.trim()} |`;
      }
    )
    .replace(
      /(?<=\|\s*)([^|\[\]]{5,70}?,\s*p\.?\s*(\d+))(?=\s*\|)/g,
      (_match, full, page) => {
        if (full.startsWith('[')) return _match;
        const docPart = full.replace(/,\s*p\.?\s*\d+$/, '').trim();
        if (!docPart || /^[\d$#\-*%]+$/.test(docPart)) return _match;
        return makeCiteLink(docPart, page);
      }
    );
}

/**
 * Find a matching reference chunk for a citation doc title and page.
 * Uses progressively looser matching: exact title+page, partial title+page,
 * then title-only, then keyword overlap.
 */
function findChunkForCitation(doc: string, page: number, chunks: ReferenceChunk[]): ReferenceChunk | undefined {
  if (chunks.length === 0) return undefined;
  const docLower = doc.toLowerCase().replace(/\.pdf$/i, '').trim();
  const docWords = docLower.split(/[\s_\-]+/).filter(w => w.length > 2);

  // 1. Exact substring match + page
  const exactPage = chunks.find(c => {
    const t = c.doc_title.toLowerCase();
    return (t.includes(docLower) || docLower.includes(t)) && c.page === page;
  });
  if (exactPage) return exactPage;

  // 2. Exact substring match, any page
  const exactAnyPage = chunks.find(c => {
    const t = c.doc_title.toLowerCase();
    return t.includes(docLower) || docLower.includes(t);
  });
  if (exactAnyPage) return exactAnyPage;

  // 3. Keyword overlap (at least 60% of doc words match)
  const threshold = Math.max(2, Math.ceil(docWords.length * 0.6));
  let bestMatch: ReferenceChunk | undefined;
  let bestScore = 0;
  for (const c of chunks) {
    const t = c.doc_title.toLowerCase();
    const matches = docWords.filter(w => t.includes(w)).length;
    const pageBonus = c.page === page ? 1 : 0;
    const score = matches + pageBonus;
    if (matches >= threshold && score > bestScore) {
      bestScore = score;
      bestMatch = c;
    }
  }
  return bestMatch;
}

function SegmentedMarkdown({ markdown, mdComponents, chunks, validationResult }: {
  markdown: string;
  mdComponents: Record<string, React.ComponentType<any>>;
  chunks: ReferenceChunk[];
  validationResult?: ValidationResult | null;
}) {
  const dispatch = useAppDispatch();
  const processed = useMemo(() => linkifyCitations(promoteHeadings(markdown)), [markdown]);
  const segments = useContentSegments(processed);

  // Build a lookup of validated/invalid citations
  const citeStatusMap = useMemo(() => {
    const map = new Map<string, 'valid' | 'invalid'>();
    if (!validationResult?.details) return map;
    for (const d of validationResult.details) {
      const key = d.citation.toLowerCase().trim();
      map.set(key, d.status === 'PASS' ? 'valid' : 'invalid');
    }
    return map;
  }, [validationResult]);

  const handleCiteClick = useCallback((doc: string, page: number) => {
    if (chunks.length === 0) {
      return;
    }
    dispatch(setChunks(chunks));
    const match = findChunkForCitation(doc, page, chunks);
    if (match) {
      dispatch(selectChunk(match.chunk_id));
    }
  }, [chunks, dispatch]);

  const citeAwareComponents = useMemo(() => ({
    ...mdComponents,
    a: ({ children, href, ...props }: MdComponentProps) => {
      if (typeof href === 'string' && href.includes('#cite~')) {
        const fragment = href.split('#cite~')[1] ?? '';
        const parts = fragment.split('~');
        const doc = decodeURIComponent(parts[0] ?? '');
        const page = parseInt(parts[1] ?? '0', 10);

        // Determine validation status for this citation
        let statusClass = '';
        if (citeStatusMap.size > 0) {
          const citeKey = `${doc.toLowerCase().trim()}, p.${page}`;
          const status = citeStatusMap.get(citeKey);
          if (status === 'invalid') {
            statusClass = ' cite-invalid';
          } else if (status === 'valid') {
            statusClass = ' cite-valid';
          }
          // If invalid, don't make it clickable
          if (status === 'invalid') {
            return (
              <span
                className={`cite-link cite-invalid`}
                title="Citation could not be verified"
                {...props}
              >
                {children}
              </span>
            );
          }
        }

        return (
          <a
            href="#"
            className={`cite-link${statusClass}`}
            onClick={(e) => {
              e.preventDefault();
              handleCiteClick(doc, page);
            }}
            {...props}
          >
            {children}
          </a>
        );
      }
      return (
        <a href={href as string} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    },
  }), [mdComponents, handleCiteClick, citeStatusMap]);

  return (
    <div className="ai-response-body">
      {segments.map((seg, i) =>
        seg.kind === 'plotly' ? (
          <PlotlyCard key={i} spec={seg.spec} />
        ) : seg.kind === 'chart' ? (
          <ChartCard key={i} spec={seg.spec} />
        ) : (
          <div key={i} className="max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]} components={citeAwareComponents}>
              {seg.text}
            </ReactMarkdown>
          </div>
        )
      )}
    </div>
  );
}

function embedQuestion(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;
  return cloneElement(node as React.ReactElement<{ embedded?: boolean }>, { embedded: true });
}

function answeredAskUser(toolCall: { name?: string; args?: unknown; content?: unknown }): { question: string; answer: string } | null {
  if (toolCall.name !== 'ask_user') return null;
  const args = toolCall.args;
  const question = args && typeof args === 'object' && !Array.isArray(args)
    && typeof (args as { question?: unknown }).question === 'string'
    ? (args as { question: string }).question.trim()
    : '';
  const answer = typeof toolCall.content === 'string' ? toolCall.content.trim() : '';
  if (!answer) return null;
  return { question, answer };
}

function extractMessageText(content: unknown): string {
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
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
  return stripClassificationBlock(text);
}

/** Remove the <classification>...</classification> block injected by the BFF. */
function stripClassificationBlock(text: string): string {
  return text.replace(/<classification>[\s\S]*?<\/classification>\s*/g, '').trimStart();
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
  a: ({ children, href, ...props }: MdComponentProps) => (
    <a href={href as string} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
  table: ({ children, ...props }: MdComponentProps) => (
    <div className="table-wrap">
      <table {...props}>{children}</table>
    </div>
  ),
  pre: MarkdownPre,
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
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]} components={mdComponents}>
                {plain}
              </ReactMarkdown>
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

function toolStillRunning(messages: Message[]): boolean {
  return messages.some((message) => {
    if (message.type !== 'ai') return false;
    const calls = (message as { tool_calls?: Array<{ name?: string; content?: unknown }> }).tool_calls;
    if (!Array.isArray(calls)) return false;
    return calls.some((tc) => tc.name !== 'write_todos' && tc.content == null);
  });
}

function waitingAfterFinishedTool(messages: Message[]): boolean {
  if (toolStillRunning(messages)) return false;
  let lastAi: Message | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'ai') {
      lastAi = messages[i];
      break;
    }
  }
  if (!lastAi) return false;
  const calls = (lastAi as { tool_calls?: Array<{ name?: string }> }).tool_calls;
  if (!Array.isArray(calls)) return false;
  const visible = calls.filter((tc) => tc.name !== 'write_todos');
  if (visible.length === 0) return false;
  const last = messages.at(-1);
  return last?.type !== 'ai' || last === lastAi;
}

function isThinkingLive(message: Message, isLoading: boolean, isLastAi: boolean): boolean {
  if (!isLoading || !isLastAi) return false;
  const stored = (message as { thinking?: unknown }).thinking;
  const parts = splitMessageParts(message);
  const thinking = typeof stored === 'string' && stored.trim().length > 0 ? stored : parts.thinking;
  if (thinking.trim().length === 0) return false;
  return parts.answer.trim().length === 0;
}

interface AiMessageBubbleProps {
  message: Message;
  thinkingLive?: boolean;
  referenceChunks?: ReferenceChunk[];
  turnSummary?: TurnSummary;
  validationResult?: ValidationResult | null;
}

const AiMessageBubble: React.FC<AiMessageBubbleProps> = ({ message, thinkingLive = false, referenceChunks = [], turnSummary, validationResult }) => {
  const storedThinking = (message as { thinking?: unknown }).thinking;
  const hasStoredThinking = typeof storedThinking === 'string' && storedThinking.length > 0;
  const parts = splitMessageParts(message);
  const localThinking = hasStoredThinking ? storedThinking : parts.thinking;
  const answer = parts.answer;
  const userToggledThinking = useRef(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [expandedToolIdx, setExpandedToolIdx] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (userToggledThinking.current) return;
    if (thinkingLive) setThinkingExpanded(true);
    else setThinkingExpanded(false);
  }, [thinkingLive]);

  const turnSteps = turnSummary?.steps ?? [];
  const totalToolCalls = turnSummary?.totalToolCalls ?? 0;
  const hasLocalThinking = localThinking.length > 0;
  const hasTurnData = turnSteps.length > 0;
  const hasThinkingOrTools = hasTurnData || hasLocalThinking;

  const toggleToolDetail = (key: string) => {
    setExpandedToolIdx(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const customRaw = (message as Record<string, unknown>).custom_data;
  const customData =
    customRaw != null && typeof customRaw === 'object' && !Array.isArray(customRaw)
      ? (customRaw as Record<string, unknown>)
      : null;
  const bodyMd =
    answer.length > 0
      ? answer
      : (hasLocalThinking || hasTurnData) || typeof message.content === 'string'
        ? ''
        : extractMessageText(message.content);

  let globalToolIdx = 0;

  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full gradient-brand flex items-center justify-center shadow-sm">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0 space-y-2">
        {hasThinkingOrTools && (
          <div>
            <button
              type="button"
              className="flex items-center gap-1.5 px-1 py-1 text-left text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
              aria-expanded={thinkingExpanded}
              onClick={() => {
                userToggledThinking.current = true;
                setThinkingExpanded((open) => !open);
              }}
            >
              {thinkingExpanded
                ? <ChevronDown className="w-3 h-3 shrink-0" aria-hidden="true" />
                : <ChevronRight className="w-3 h-3 shrink-0" aria-hidden="true" />}
              {thinkingLive ? (
                <span className="animate-pulse text-xs">Thinking...</span>
              ) : (
                <span className="text-xs italic">
                  Thought process
                  {totalToolCalls > 0 && (
                    <span className="text-muted-foreground/40 ml-1">
                      &middot; {totalToolCalls} tool call{totalToolCalls > 1 ? 's' : ''}
                    </span>
                  )}
                </span>
              )}
            </button>
            {thinkingExpanded && (
              <div className="ml-1 pl-3 border-l-2 border-muted-foreground/15 space-y-2">
                {hasTurnData ? turnSteps.map((step, stepIdx) => {
                  if (step.type === 'thinking' && step.thinking) {
                    return (
                      <div key={`think-${stepIdx}`} className="text-[13px] leading-relaxed text-muted-foreground/60 italic [&_strong]:font-medium [&_strong]:text-muted-foreground/70 [&_p]:mb-1.5 [&_p:last-child]:mb-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{step.thinking}</ReactMarkdown>
                      </div>
                    );
                  }
                  if (step.type === 'tools' && step.toolCalls) {
                    const calls = step.toolCalls;
                    return (
                      <div key={`tools-${stepIdx}`} className="space-y-1 my-1">
                        {calls.map((tc, i) => {
                          const toolKey = `${stepIdx}-${i}`;
                          const isOpen = expandedToolIdx.has(toolKey);
                          const hasError = (tc as Record<string, unknown>).status === 'error';
                          globalToolIdx++;
                          return (
                            <div key={toolKey} className="border border-border/40 rounded-lg overflow-hidden bg-card/50">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); toggleToolDetail(toolKey); }}
                                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-muted/30 transition-colors"
                              >
                                <div className="flex items-center gap-2 text-xs">
                                  {hasError ? (
                                    <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />
                                  ) : (tc as Record<string, unknown>).content != null ? (
                                    <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                                  ) : (
                                    <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                                  )}
                                  <code className="font-mono text-[11px] bg-muted/50 px-1 py-0.5 rounded">{tc.name}</code>
                                  <span className="text-muted-foreground/50 text-[11px]">
                                    {formatToolActivity(tc as { name: string; args?: Record<string, unknown> })}
                                  </span>
                                </div>
                                {isOpen
                                  ? <ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                                  : <ChevronRight className="w-3 h-3 text-muted-foreground/40 shrink-0" />}
                              </button>
                              {isOpen && (
                                <div className="border-t border-border/30 px-3 pb-2 max-h-60 overflow-y-auto">
                                  <div className="text-[10px] font-medium text-muted-foreground/50 mb-1 mt-2 uppercase tracking-wider">Arguments</div>
                                  <pre className="text-[11px] text-foreground/70 bg-muted/40 border border-border/30 p-2 rounded overflow-auto font-mono">
                                    {JSON.stringify(tc.args, null, 2)}
                                  </pre>
                                  {tc.content != null && (
                                    <>
                                      <div className={cn(
                                        "text-[10px] font-medium mb-1 mt-2 uppercase tracking-wider",
                                        hasError ? "text-red-500/70" : "text-muted-foreground/50",
                                      )}>
                                        {hasError ? 'Error' : 'Result'}
                                      </div>
                                      <pre className="text-[11px] text-foreground/70 bg-muted/40 border border-border/30 p-2 rounded overflow-auto font-mono max-h-40">
                                        {typeof tc.content === 'string'
                                          ? tc.content.slice(0, 2000)
                                          : JSON.stringify(tc.content, null, 2).slice(0, 2000)}
                                      </pre>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                }) : hasLocalThinking && (
                  <div className="text-[13px] leading-relaxed text-muted-foreground/60 italic [&_strong]:font-medium [&_strong]:text-muted-foreground/70 [&_p]:mb-1.5 [&_p:last-child]:mb-0">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{localThinking}</ReactMarkdown>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {(bodyMd.length > 0 || customData) && (
          <div className="ai-response-body">
            {bodyMd.length > 0 && (
              <SegmentedMarkdown markdown={bodyMd} mdComponents={mdComponents} chunks={referenceChunks} validationResult={validationResult} />
            )}
            {customData && <CustomDataRenderer data={customData} />}
          </div>
        )}
      </div>
    </div>
  );
};

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
  isStreamingLastAi?: boolean;
  questionContent?: ReactNode;
  referenceChunks?: ReferenceChunk[];
  turnSummary?: TurnSummary;
  validationResult?: ValidationResult | null;
}

export function AIMessageRenderer({ message, pendingInterrupt, onInterruptResume, onAlwaysAllow, globalApprovalIndex = 0, approvalSlotOffset = 0, totalActionRequests = 0, allDecisionsMade = false, onSingleDecision, thinkingLive = false, isStreamingLastAi = false, questionContent, referenceChunks = [], turnSummary, validationResult }: AIMessageRendererProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const messageKey = JSON.stringify(message);

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

  useEffect(() => {
    const allToolCalls = (message as { tool_calls?: unknown[] }).tool_calls;
    if (!Array.isArray(allToolCalls)) return;
    const visibleCalls = allToolCalls.filter(
      (tc) => tc && typeof tc === 'object' && !isSubAgentToolCall(tc as never) && (tc as { name?: string }).name !== 'write_todos',
    );

    setExpandedItems((prev) => {
      const next = new Set(prev);
      let changed = false;

      visibleCalls.forEach((tc: any, idx: number) => {
        const itemId = `${message.id}-${idx}`;
        const needsApproval = (pendingToolNames.has(tc.name) || pendingToolNames.has('task')) && !tc.content;
        const isRunning = tc.content == null;
        const isFinished = tc.content != null;
        const hasMcpAppResult = Boolean(parseMcpApp(tc.mcpApp));

        if (needsApproval && !next.has(itemId) && !userCollapsedRef.current.has(itemId)) {
          next.add(itemId);
          changed = true;
        } else if (hasMcpAppResult && isFinished && !next.has(itemId) && !userCollapsedRef.current.has(itemId)) {
          next.add(itemId);
          changed = true;
        } else if (isFinished && !hasMcpAppResult && next.has(itemId) && !userExpandedRef.current.has(itemId)) {
          next.delete(itemId);
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingToolNames, message.id, messageKey]);

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
    const allToolCalls = (message as any).tool_calls ?? [];
    const map = new Map<string, number>();
    let localSlot = 0;
    for (const tc of allToolCalls) {
      if (tc.name === 'write_todos') continue;
      const isApprovable = (pendingToolNames.has(tc.name) || pendingToolNames.has('task')) && !(tc as Record<string, unknown>).content;
      if (isApprovable) {
        const key = tc.id ?? `${tc.name}-${localSlot}`;
        map.set(key, approvalSlotOffset + localSlot);
        localSlot++;
      }
    }
    return map;
  }, [message, pendingToolNames, approvalSlotOffset]);

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
      const questionCalls = regularCalls.filter((tc) => tc.name === 'ask_user');
      const otherCalls = regularCalls.filter((tc) => tc.name !== 'ask_user');
      const parts = splitMessageParts(message);
      const storedThinking = (message as { thinking?: unknown }).thinking;
      const thinkingText = typeof storedThinking === 'string' && storedThinking.length > 0
        ? storedThinking
        : parts.thinking;
      const narration = (typeof storedThinking === 'string' && typeof message.content === 'string'
        ? message.content
        : parts.answer).trim();

      return (
        <div className="space-y-2 w-full" aria-live="off">
          {(narration || thinkingText || isStreamingLastAi) ? (
            <AiMessageBubble message={message} thinkingLive={thinkingLive || isStreamingLastAi} referenceChunks={referenceChunks} turnSummary={turnSummary} validationResult={validationResult} />
          ) : null}
          {subAgentCalls.map((toolCall, idx) => {
            const tcId = (toolCall as any).id ?? `${toolCall.name}-${idx}`;
            const slot = approvalSlotByToolCallId.get(tcId);
            const isThisCurrent = slot !== undefined && slot === globalApprovalIndex && !allDecisionsMade;
            let runningSubagentIdx = -1;
            subAgentCalls.forEach((call, callIdx) => {
              if (isRunningToolCall(call as { content?: unknown })) runningSubagentIdx = callIdx;
            });
            return (
              <SubAgentIndicator
                key={`${message.id}-sa-${idx}`}
                toolCall={toolCall as any}
                messageId={message.id ?? ''}
                index={idx}
                pendingInterrupt={pendingInterrupt}
                onInterruptResume={onInterruptResume}
                onSingleDecision={totalActionRequests > 1 ? onSingleDecision : undefined}
                isCurrentApproval={totalActionRequests > 1 ? isThisCurrent : undefined}
                onAlwaysAllow={onAlwaysAllow}
                question={questionContent && idx === runningSubagentIdx ? embedQuestion(questionContent) : undefined}
              />
            );
          })}

          {questionCalls.map((toolCall, idx) => {
            const exchange = answeredAskUser(toolCall);
            if (!exchange) return null;
            return (
              <div key={`${message.id}-ask-${idx}`} className="flex items-start gap-3">
                <div className="w-8 shrink-0" aria-hidden="true" />
                <div
                  className="min-w-0 flex-1 max-w-[85%] sm:max-w-[80%] bg-card border border-border rounded-xl px-4 py-3 text-sm"
                  role="group"
                  aria-label="Answered question"
                >
                  {exchange.question && (
                    <p className="font-medium text-foreground">{exchange.question}</p>
                  )}
                  <p className={exchange.question ? 'mt-1 text-muted-foreground' : 'text-muted-foreground'}>
                    {exchange.answer}
                  </p>
                </div>
              </div>
            );
          })}

          {otherCalls.length > 0 && !isStreamingLastAi && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
                <Settings className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                {otherCalls.map((toolCall, idx) => {
                  const itemId = `${message.id}-${idx}`;
                  const isExpanded = expandedItems.has(itemId);
                  const needsApproval = (pendingToolNames.has(toolCall.name) || pendingToolNames.has('task')) && !(toolCall as Record<string, unknown>).content;
                  const regTcId = (toolCall as any).id ?? `${toolCall.name}-${idx}`;
                  const regSlot = approvalSlotByToolCallId.get(regTcId);
                  const isThisCurrentApproval = regSlot !== undefined && regSlot === globalApprovalIndex && !allDecisionsMade;
                  const showButtons = totalActionRequests <= 1 ? needsApproval : (needsApproval && isThisCurrentApproval);
                  const mcpAppDesc = parseMcpApp((toolCall as Record<string, unknown>).mcpApp);
                  const hasMcpApp = Boolean(mcpAppDesc);
                  // Keep the tool body mounted when an MCP App is present so collapse hides
                  // the iframe instead of destroying it (host teardown runs on real unmount).
                  const keepToolBodyMounted = isExpanded || (!needsApproval && hasMcpApp);

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
                              {(toolCall as Record<string, unknown>).status === 'error' ? (
                                <AlertCircle className="w-4 h-4 text-red-500 dark:text-red-400" aria-hidden="true" />
                              ) : (toolCall as Record<string, unknown>).content != null ? (
                                <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" aria-hidden="true" />
                              ) : (
                                <Loader2 className="w-4 h-4 text-primary animate-spin" aria-hidden="true" />
                              )}
                            </div>
                            <div className={cn(
                              "text-xs mt-0.5",
                              (toolCall as Record<string, unknown>).status === 'error' ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground',
                            )}>
                              {(toolCall as Record<string, unknown>).status === 'error'
                                ? (typeof (toolCall as Record<string, unknown>).content === 'string'
                                  && String((toolCall as Record<string, unknown>).content).replace(/^\[TOOL_ERROR]\s*/i, '').trim()
                                  ? String((toolCall as Record<string, unknown>).content).replace(/^\[TOOL_ERROR]\s*/i, '').trim().slice(0, 150)
                                  : 'Tool execution failed')
                                : 'Tool execution'}
                            </div>
                          </div>
                        </div>
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                        )}
                      </button>

                      {keepToolBodyMounted && (
                        <div
                          id={`tool-body-${itemId}`}
                          className={cn("border-t border-border", !isExpanded && !hasMcpApp && "hidden")}
                        >
                          {isExpanded && (
                            <div className="px-4 pb-3 max-h-72 overflow-y-auto">
                              <div className="text-xs font-medium text-muted-foreground mb-2 mt-3 uppercase tracking-wider">Arguments</div>
                              <pre className="text-xs text-foreground bg-muted border border-border p-3 rounded-lg overflow-auto font-mono">
                                {JSON.stringify(toolCall.args, null, 2)}
                              </pre>
                            </div>
                          )}
                          {!needsApproval && hasMcpApp && (() => {
                            const tcRecord = toolCall as Record<string, unknown>;
                            const plotlyFigure = toolCall.name === 'create_chart_app'
                              ? extractPlotlyFigure(tcRecord)
                              : null;
                            if (plotlyFigure) {
                              const meta = extractChartMeta(tcRecord);
                              return (
                                <div className="px-4 pb-3">
                                  <NativeChartViewer
                                    figure={plotlyFigure}
                                    title={meta.title}
                                    chartType={meta.chartType}
                                    className="mb-2"
                                  />
                                </div>
                              );
                            }
                            return (
                              <div className="px-4 pb-3">
                                <McpAppHostFromToolCall
                                  mcpAppRaw={tcRecord.mcpApp}
                                  toolName={toolCall.name}
                                  toolCancelled={
                                    tcRecord.content != null &&
                                    !mcpAppDesc?.result
                                  }
                                  className="mb-2"
                                />
                              </div>
                            );
                          })()}
                          {isExpanded && !needsApproval && (
                            <div className="px-4 pb-3 max-h-72 overflow-y-auto">
                              <div className={cn(
                                "text-xs font-medium mb-2 mt-3 uppercase tracking-wider",
                                (toolCall as Record<string, unknown>).status === 'error' ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground',
                              )}>
                                {(toolCall as Record<string, unknown>).status === 'error'
                                  ? 'Error'
                                  : (toolCall as Record<string, unknown>).content != null
                                    ? 'Result'
                                    : 'Running...'}
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
                            </div>
                          )}
                        </div>
                      )}

                      {showButtons && onInterruptResume && (
                        <div role="alert" aria-live="assertive" aria-label={`Tool call ${toolCall.name} requires approval`} className="flex items-center gap-2 px-4 py-3 border-t border-yellow-500/30 bg-yellow-500/5 flex-wrap">
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
      return <AiMessageBubble message={message} thinkingLive={thinkingLive} referenceChunks={referenceChunks} turnSummary={turnSummary} validationResult={validationResult} />;
    }

    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageKey, expandedItems, globalApprovalIndex, allDecisionsMade, pendingInterrupt, onInterruptResume, onAlwaysAllow, onSingleDecision, totalActionRequests, approvalSlotByToolCallId, thinkingLive]);

  return (
    <div className="space-y-2 w-full">
      {renderMessage}
    </div>
  );
}

const PATHFINDER_TOOLS = new Set([
  'pathfinder_search',
  'pathfinder_search_semantic',
  'pathfinder_search_keyword',
  'pathfinder_get_chunk',
  'pathfinder_get_page',
  'search',
  'search_semantic',
  'search_keyword',
  'search_dataversehelp',
]);

const VALIDATION_TOOL = 'pathfinder_validate_citations';

interface ValidationResult {
  total_citations: number;
  valid: number;
  invalid: number;
  score: number;
  grade: string;
  details: Array<{ citation: string; status: string; reason?: string; doc_id?: string }>;
}

function parseValidationPayload(content: unknown): ValidationResult | null {
  if (content == null) return null;
  try {
    let obj: unknown = content;
    if (typeof obj === 'string') obj = JSON.parse(obj);
    if (Array.isArray(obj)) {
      const first = obj[0];
      if (first && typeof first === 'object' && 'type' in first && (first as Record<string, unknown>).type === 'text') {
        const text = (first as Record<string, unknown>).text;
        if (typeof text === 'string') obj = JSON.parse(text);
      }
    }
    if (obj && typeof obj === 'object' && 'total_citations' in obj) {
      return obj as ValidationResult;
    }
  } catch { /* skip */ }
  return null;
}

function extractValidationResult(messages: Message[], answerIndex: number): ValidationResult | null {
  for (let i = answerIndex - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === 'human') break;
    if (m.type === 'tool') {
      const toolMsg = m as Record<string, unknown>;
      if (toolMsg.name === VALIDATION_TOOL) {
        const result = parseValidationPayload(toolMsg.content);
        if (result) return result;
      }
    }
    if (m.type === 'ai') {
      const tcs = (m as Record<string, unknown>).tool_calls as Array<{ name: string; content?: unknown }> | undefined;
      if (Array.isArray(tcs)) {
        for (const tc of tcs) {
          if (tc.name === VALIDATION_TOOL) {
            const result = parseValidationPayload(tc.content);
            if (result) return result;
          }
        }
      }
    }
  }
  return null;
}

function extractCitationsFromMarkdown(text: string): Array<{ doc_title: string; page: number }> {
  const citePattern = /\(([^()]+?),\s*p\.?\s*(\d+)\)/g;
  const seen = new Set<string>();
  const citations: Array<{ doc_title: string; page: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = citePattern.exec(text)) !== null) {
    const rawTitle = match[1].trim().replace(/\.pdf$/i, '');
    const page = parseInt(match[2], 10);
    const key = `${rawTitle.toLowerCase()}|${page}`;
    if (!seen.has(key) && page > 0) {
      seen.add(key);
      citations.push({ doc_title: rawTitle, page });
    }
  }
  return citations;
}

function useAutoValidation(messageText: string, isComplete: boolean): ValidationResult | null {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const requestedRef = useRef(false);

  useEffect(() => {
    if (!isComplete || requestedRef.current || !messageText) return;
    const citations = extractCitationsFromMarkdown(messageText);
    if (citations.length === 0) return;
    requestedRef.current = true;

    const controller = new AbortController();
    (async () => {
      try {
        const resp = await fetch('/api/validate-citations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ citations }),
          signal: controller.signal,
        });
        if (resp.ok) {
          const data = await resp.json();
          setResult(data);
        }
      } catch { /* network error or aborted */ }
    })();
    return () => controller.abort();
  }, [messageText, isComplete]);

  return result;
}

function ValidationBadge({ result }: { result: ValidationResult }) {
  const gradeColors: Record<string, string> = {
    A: 'text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/50 dark:border-emerald-800',
    B: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-950/50 dark:border-blue-800',
    C: 'text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/50 dark:border-amber-800',
    F: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-950/50 dark:border-red-800',
  };
  const gradeIcons: Record<string, React.ReactNode> = {
    A: <ShieldCheck className="w-3.5 h-3.5" />,
    B: <CheckCircle className="w-3.5 h-3.5" />,
    C: <AlertCircle className="w-3.5 h-3.5" />,
    F: <AlertCircle className="w-3.5 h-3.5" />,
  };
  const colorClass = gradeColors[result.grade] ?? gradeColors.C;
  const icon = gradeIcons[result.grade] ?? gradeIcons.C;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="pl-11 mt-2">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className={cn(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
          colorClass,
        )}
      >
        {icon}
        <span>Verified</span>
        <span className="font-bold">{result.valid}/{result.total_citations}</span>
        <span className="opacity-70">citations</span>
        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold opacity-90">
          Grade {result.grade}
        </span>
        {result.invalid > 0 && (
          <span className="text-red-500 dark:text-red-400 text-[10px]">
            ({result.invalid} failed)
          </span>
        )}
        <ChevronDown className={cn('w-3 h-3 transition-transform', expanded && 'rotate-180')} />
      </button>
      {expanded && (
        <div className="mt-2 ml-1 rounded-lg border border-border/40 bg-card/50 p-3 text-xs max-w-lg">
          <div className="font-semibold mb-2 text-foreground/80">Citation Validation Details</div>
          <div className="space-y-1">
            {result.details.map((d, i) => (
              <div key={i} className="flex items-start gap-2">
                {d.status === 'PASS' ? (
                  <Check className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                )}
                <span className={d.status === 'PASS' ? 'text-foreground/70' : 'text-red-600 dark:text-red-400'}>
                  {d.citation}
                  {d.reason && <span className="opacity-60 ml-1">- {d.reason}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function useMessageValidation(message: Message, messages: Message[], messageIndex: number, isComplete: boolean): ValidationResult | null {
  const { markdownForDisplay } = partitionMessageContent(message.content);
  const messageText = markdownForDisplay || extractMessageText(message.content);

  const agentResult = extractValidationResult(messages, messageIndex);
  const autoResult = useAutoValidation(messageText, isComplete);
  return agentResult ?? autoResult;
}

function AutoValidationBadge({ validationResult }: {
  validationResult: ValidationResult | null;
}) {
  if (!validationResult) return null;
  return <ValidationBadge result={validationResult} />;
}

const TOOL_LABELS: Record<string, string> = {
  pathfinder_search: 'Searching documents',
  pathfinder_search_semantic: 'Semantic search',
  pathfinder_search_keyword: 'Keyword search',
  pathfinder_list_documents: 'Listing documents',
  pathfinder_get_chunk: 'Reading chunk',
  pathfinder_get_page: 'Reading page',
  pathfinder_get_document_outline: 'Reading outline',
  pathfinder_validate_citations: 'Validating citations',
  search: 'Searching documents',
  search_semantic: 'Semantic search',
  search_keyword: 'Keyword search',
  search_dataversehelp: 'Searching Dataverse Help',
  get_chunk: 'Reading chunk',
};

function formatToolActivity(tc: { name: string; args?: Record<string, unknown> }): string {
  const label = TOOL_LABELS[tc.name] ?? tc.name;
  const query = tc.args?.query;
  const docId = tc.args?.doc_id;
  if (typeof query === 'string' && query.length > 0) {
    const short = query.length > 50 ? query.slice(0, 47) + '...' : query;
    return `${label}: "${short}"`;
  }
  if (docId) return `${label} (doc: ${String(docId).slice(0, 8)}...)`;
  return label;
}

function StreamingActivityPanel({ messages }: { messages: Message[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  const steps = useMemo(() => {
    const items: Array<{ key: string; label: string; status: 'done' | 'running'; count?: number }> = [];
    let lastAiToolCalls: Array<{ name: string; args?: Record<string, unknown>; content?: unknown }> = [];

    for (const m of messages) {
      if (m.type === 'ai') {
        const tcs = (m as Record<string, unknown>).tool_calls as Array<{ name: string; args?: Record<string, unknown>; content?: unknown }> | undefined;
        if (Array.isArray(tcs) && tcs.length > 0) {
          lastAiToolCalls = tcs;
          const allDone = tcs.every(tc => tc.content != null);
          const toolNames = tcs.map(tc => tc.name);
          const uniqueTools = [...new Set(toolNames)];

          if (tcs.length > 1) {
            const label = uniqueTools.length === 1
              ? `${TOOL_LABELS[uniqueTools[0]] ?? uniqueTools[0]} (${tcs.length} parallel)`
              : `${tcs.length} parallel searches`;
            items.push({ key: `${m.id}-batch`, label, status: allDone ? 'done' : 'running', count: tcs.length });
          } else {
            items.push({ key: `${m.id}-0`, label: formatToolActivity(tcs[0]), status: allDone ? 'done' : 'running' });
          }
        }
      }
    }

    const hasRunning = items.some(i => i.status === 'running');
    if (!hasRunning && lastAiToolCalls.length > 0) {
      items.push({ key: 'synthesizing', label: 'Synthesizing answer...', status: 'running' });
    }

    return items;
  }, [messages]);

  if (steps.length === 0) {
    return (
      <div className="flex items-start gap-3 animate-fadeIn" role="status" aria-live="polite">
        <div className="flex-shrink-0 w-7 h-7 rounded-full gradient-brand flex items-center justify-center shadow-sm">
          <Bot className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
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
              {step.status === 'done' ? (
                <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
              ) : (
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin flex-shrink-0" />
              )}
              <span className={step.status === 'done' ? 'text-muted-foreground/60' : 'text-foreground/80 font-medium'}>
                {step.label}
              </span>
              {step.count && step.count > 1 && step.status === 'done' && (
                <span className="text-[10px] text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full font-medium">
                  done
                </span>
              )}
            </div>
          ))}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function extractChunksFromToolCalls(
  toolCalls: Array<{ name: string; args?: Record<string, unknown>; content?: unknown }>,
): ReferenceChunk[] {
  const chunks: ReferenceChunk[] = [];
  const seenIds = new Set<string>();

  function extractResults(raw: unknown): Record<string, unknown>[] {
    if (raw == null) return [];
    if (typeof raw === 'string') {
      try { return extractResults(JSON.parse(raw)); } catch { return []; }
    }
    if (Array.isArray(raw)) {
      if (raw.length > 0 && raw[0] && typeof raw[0] === 'object') {
        const first = raw[0] as Record<string, unknown>;
        if ('type' in first && first.type === 'text' && typeof first.text === 'string') {
          return extractResults(first.text);
        }
        if ('chunk_id' in first || 'doc_title' in first || 'body' in first) {
          return raw as Record<string, unknown>[];
        }
      }
      return [];
    }
    if (typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      if ('results' in obj && Array.isArray(obj.results)) return extractResults(obj.results);
      if ('chunk_id' in obj || 'doc_title' in obj) return [obj];
    }
    return [];
  }

  for (const tc of toolCalls) {
    if (!PATHFINDER_TOOLS.has(tc.name)) continue;
    const query = typeof tc.args?.query === 'string' ? tc.args.query : undefined;
    const results = extractResults(tc.content);

    for (const item of results) {
      const chunkId = String(item.chunk_id ?? item.id ?? `chunk-${chunks.length}`);
      if (seenIds.has(chunkId)) continue;
      seenIds.add(chunkId);

      const channels = item.channels as Record<string, number> | undefined;
      const denseScore = channels?.dense ?? 0;
      const rawScore = Number(item.score ?? 0);
      const rank = Number(item.rank ?? chunks.length + 1);
      const displayScore = denseScore > 0
        ? denseScore
        : rank <= 3 ? 0.9 - (rank - 1) * 0.1
        : rank <= 6 ? 0.7 - (rank - 4) * 0.05
        : Math.max(0.4, 0.6 - (rank - 7) * 0.03);
      const rawTitle = String(item.doc_title ?? item.document ?? 'Unknown');
      const cleanTitle = rawTitle.replace(/__[A-Za-z0-9_-]+$/, '').replace(/\.pdf$/i, '').trim() || rawTitle;
      const rawBbox = item.bbox as number[] | undefined;
      const bbox: [number, number, number, number] | undefined =
        Array.isArray(rawBbox) && rawBbox.length === 4
          ? [rawBbox[0], rawBbox[1], rawBbox[2], rawBbox[3]]
          : undefined;

      chunks.push({
        chunk_id: chunkId,
        doc_title: cleanTitle,
        raw_doc_title: rawTitle,
        page: Number(item.page_number ?? item.page ?? 0),
        text: String(item.body ?? item.text ?? ''),
        score: displayScore,
        crop_path: item.crop_path ? String(item.crop_path) : undefined,
        section: item.section_header ? String(item.section_header) : (item.section ? String(item.section) : undefined),
        doc_id: item.doc_id ? String(item.doc_id) : undefined,
        search_query: query,
        bbox,
      });
    }
  }
  return chunks;
}

function collectToolCallsForAnswer(messages: Message[], answerIndex: number): Array<{ name: string; args?: Record<string, unknown>; content?: unknown }> {
  const all: Array<{ name: string; args?: Record<string, unknown>; content?: unknown }> = [];
  const seenIds = new Set<string>();

  // Build a map of tool_call_id -> tool message content for fallback
  // (when messages are loaded from server, tool_calls on AI messages
  // don't have content populated, it lives in separate tool messages)
  const toolResultMap = new Map<string, unknown>();
  for (let i = answerIndex - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === 'human') break;
    if (m.type === 'tool') {
      const rec = m as Record<string, unknown>;
      const tcId = rec.tool_call_id as string | undefined;
      if (tcId && rec.content != null) {
        toolResultMap.set(tcId, rec.content);
      }
    }
  }

  for (let i = answerIndex - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type === 'human') break;
    if (m.type === 'ai') {
      const tcs = (m as Record<string, unknown>).tool_calls as Array<{ id?: string; name: string; args?: Record<string, unknown>; content?: unknown }> | undefined;
      if (!Array.isArray(tcs)) continue;
      for (const tc of tcs) {
        if (!PATHFINDER_TOOLS.has(tc.name)) continue;
        const tcId = tc.id ?? '';
        if (seenIds.has(tcId)) continue;
        seenIds.add(tcId);

        // Use content from redux merge first, then fall back to tool message
        const content = tc.content ?? toolResultMap.get(tcId);
        if (content != null) {
          all.push({ name: tc.name, args: tc.args, content });
        }
      }
    }
  }
  return all;
}

interface TurnStep {
  type: 'thinking' | 'tools';
  thinking?: string;
  toolCalls?: Array<{ name: string; args?: Record<string, unknown>; content?: unknown }>;
}

interface TurnSummary {
  steps: TurnStep[];
  totalToolCalls: number;
}

function collectTurnSummary(messages: Message[], answerIndex: number): TurnSummary {
  const steps: TurnStep[] = [];
  let totalToolCalls = 0;

  const startIndex = (() => {
    for (let i = answerIndex; i >= 0; i--) {
      if (messages[i].type === 'human') return i + 1;
    }
    return 0;
  })();

  for (let i = startIndex; i <= answerIndex; i++) {
    const m = messages[i];
    if (m.type !== 'ai') continue;

    const storedThinking = (m as { thinking?: unknown }).thinking;
    const parts = splitMessageParts(m);
    const thinking = typeof storedThinking === 'string' && storedThinking.length > 0
      ? storedThinking
      : parts.thinking;
    if (thinking) steps.push({ type: 'thinking', thinking });

    const tcs = (m as Record<string, unknown>).tool_calls as Array<{ name: string; args?: Record<string, unknown>; content?: unknown }> | undefined;
    if (Array.isArray(tcs)) {
      const filtered = tcs.filter(tc => tc.name !== 'write_todos');
      if (filtered.length > 0) {
        steps.push({ type: 'tools', toolCalls: filtered });
        totalToolCalls += filtered.length;
      }
    }
  }

  return { steps, totalToolCalls };
}

function isIntermediateAiMessage(messages: Message[], index: number): boolean {
  const m = messages[index];
  if (m.type !== 'ai') return false;
  const tcs = (m as Record<string, unknown>).tool_calls as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(tcs) || tcs.length === 0) return false;
  const hasMcpAppToolCall = tcs.some(
    (tc) => tc.mcpApp || (tc.artifact && typeof tc.artifact === 'object' && (tc.artifact as Record<string, unknown>).mcp_app),
  );
  if (hasMcpAppToolCall) return false;
  for (let i = index + 1; i < messages.length; i++) {
    if (messages[i].type === 'human') return false;
    if (messages[i].type === 'ai') return true;
  }
  return false;
}

function ReferencesButton({ chunks }: { chunks: ReferenceChunk[] }) {
  const dispatch = useAppDispatch();
  const panelOpen = useAppSelector(selectPanelOpen);

  return (
    <div className="pl-11 mt-1.5">
      <button
        type="button"
        onClick={() => dispatch(setChunks(chunks))}
        className={cn(
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border',
          panelOpen
            ? 'bg-primary/10 text-primary border-primary/30'
            : 'bg-card hover:bg-muted text-muted-foreground hover:text-foreground border-border',
        )}
      >
        <BookOpen className="w-3.5 h-3.5" />
        References
        <span className="bg-primary/15 text-primary px-1.5 py-0.5 rounded-full text-[10px] font-bold">
          {chunks.length}
        </span>
      </button>
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
  chatInputRef?: React.RefObject<HTMLTextAreaElement | null>;
  onExportMarkdown?: () => void;
  onExportJson?: () => void;
}

/**
 * Wrapper component for AI messages that handles validation hook
 * and shares the result between AIMessageRenderer and ValidationBadge.
 */
function AiMessageBlock({
  message, messages, messageIndex,
  pendingInterrupt, onInterruptResume, onAlwaysAllow,
  globalApprovalIndex, approvalSlotOffset, totalActionRequests,
  allDecisionsMade, onSingleDecision,
  thinkingLive, isStreamingLastAi, questionContent, turnSummary,
  isLoading, isLastAiInTurn, interruptContent,
  copyText, chatId, traceId, userId, existingFeedback,
}: {
  message: Message;
  messages: Message[];
  messageIndex: number;
  pendingInterrupt?: InterruptInfo | null;
  onInterruptResume?: (decisions: Array<{ type: 'approve' | 'reject'; message?: string }>) => void;
  onAlwaysAllow?: (toolNames: string[]) => void;
  globalApprovalIndex: number;
  approvalSlotOffset: number;
  totalActionRequests: number;
  allDecisionsMade: boolean;
  onSingleDecision?: (decision: { type: 'approve' | 'reject'; message?: string }) => void;
  thinkingLive: boolean;
  isStreamingLastAi: boolean;
  questionContent?: ReactNode;
  turnSummary?: TurnSummary;
  isLoading: boolean;
  isLastAiInTurn: boolean;
  interruptContent?: ReactNode;
  copyText: string;
  chatId: string;
  traceId?: string | null;
  userId?: string;
  existingFeedback: 'up' | 'down' | null;
}) {
  const refChunks = useMemo(
    () => extractChunksFromToolCalls(collectToolCallsForAnswer(messages, messageIndex)),
    [messages, messageIndex],
  );

  const isNormal = message.type === 'ai' && (
    !Array.isArray((message as Record<string, unknown>).tool_calls) ||
    ((message as Record<string, unknown>).tool_calls as unknown[]).length === 0
  );

  const validationResult = useMessageValidation(message, messages, messageIndex, !isLoading);

  return (
    <>
      <AIMessageRenderer
        message={message}
        pendingInterrupt={pendingInterrupt}
        onInterruptResume={onInterruptResume}
        onAlwaysAllow={onAlwaysAllow}
        globalApprovalIndex={globalApprovalIndex}
        approvalSlotOffset={approvalSlotOffset}
        totalActionRequests={totalActionRequests}
        allDecisionsMade={allDecisionsMade}
        onSingleDecision={onSingleDecision}
        thinkingLive={thinkingLive}
        isStreamingLastAi={isStreamingLastAi}
        questionContent={questionContent}
        referenceChunks={refChunks}
        turnSummary={turnSummary}
        validationResult={validationResult}
      />
      {interruptContent ? interruptContent : (
        <MessageActionsRow
          isLastAiInTurn={isLastAiInTurn}
          copyText={copyText}
          messageId={message.id ?? `msg-${messageIndex}`}
          chatId={chatId}
          traceId={traceId}
          userId={userId}
          existingFeedback={existingFeedback}
        />
      )}
      {isNormal && refChunks.length > 0 && (
        <ReferencesButton chunks={refChunks} />
      )}
      {isNormal && isLastAiInTurn && (
        <AutoValidationBadge validationResult={validationResult} />
      )}
    </>
  );
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
        if (call.name === 'ask_user') parentAsking = true;
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
    const container = scrollAreaRef.current;
    if (!container) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 150) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, interruptContent, scrollAreaRef]);

  const showExport = Boolean(onExportMarkdown && onExportJson && messages.length > 0);

  const dvaClassification = useAppSelector(
    (state) => state.chats.streamingStates[chatId]?.dvaClassification ?? null
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
    <div className="flex flex-col flex-1 min-w-0">
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
            if (message.type === 'tool') {
              return <Fragment key={message.id ?? `m-${messageIndex}`} />;
            }
            if (isIntermediateAiMessage(messages, messageIndex)) {
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

            const msgTurnSummary = message.type === 'ai'
              ? collectTurnSummary(messages, messageIndex)
              : undefined;

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
                  {dvaClassification && messageIndex === lastAiMessageIndex && isLoading && (
                    <div className="flex items-center gap-1.5 mb-1 ml-11">
                      {dvaClassification.intents.map((intent, i) => (
                        <span
                          key={intent.intent_class}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground border border-border"
                        >
                          {intent.intent_class}
                          <span className="opacity-50">{Math.round(intent.confidence * 100)}%</span>
                        </span>
                      ))}
                      {dvaClassification.routing?.selected_product && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20">
                          {dvaClassification.routing.selected_product}
                        </span>
                      )}
                    </div>
                  )}
                  <AiMessageBlock
                    message={message}
                    messages={messages}
                    messageIndex={messageIndex}
                    pendingInterrupt={pendingInterrupt}
                    onInterruptResume={onInterruptResume}
                    onAlwaysAllow={onAlwaysAllow}
                    globalApprovalIndex={globalApprovalIndex}
                    approvalSlotOffset={approvalSlotOffsets.get(messageIndex) ?? 0}
                    totalActionRequests={globalActionRequests.length}
                    allDecisionsMade={globalAllDecisionsMade}
                    onSingleDecision={handleGlobalSingleDecision}
                    thinkingLive={isThinkingLive(message, isLoading, messageIndex === lastAiMessageIndex)}
                    isStreamingLastAi={isLoading && messageIndex === lastAiMessageIndex}
                    questionContent={messageIndex === questionNestMessageIndex ? interruptContent : undefined}
                    turnSummary={msgTurnSummary}
                    isLoading={isLoading}
                    isLastAiInTurn={isLastAiInTurn}
                    interruptContent={messageIndex === lastAiMessageIndex && interruptContent && questionNestMessageIndex < 0 ? interruptContent : undefined}
                    copyText={copyText}
                    chatId={chatId}
                    traceId={traceId}
                    userId={userId}
                    existingFeedback={messageFeedback[message.id ?? `msg-${messageIndex}`] ?? null}
                  />
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

          {isLoading && <StreamingActivityPanel messages={messages} />}

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
    <ReferencesPanel />
    </div>
  );
}
