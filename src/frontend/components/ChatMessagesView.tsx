import type React from "react";
import type { Message } from "@langchain/langgraph-sdk";
import {
  AngleDownIcon,
  AngleRightIcon,
  CheckCircleIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  ExclamationCircleIcon,
    PencilAltIcon,
  UndoIcon,
  RobotIcon,
} from "@patternfly/react-icons";
import type { InterruptInfo, ApprovalSubmission } from "../types/deep-agent";
import { ToolApprovalControls } from "./ToolApprovalControls";
import { bindToolApprovals, useInterruptApprovals } from "../hooks/useInterruptApprovals";
import type { ToolApproval } from "../hooks/useInterruptApprovals";
import { InputForm } from "./InputForm";
import { McpStatusPanel } from "./McpStatusPanel";
import { useState, useId, ReactNode, useMemo, useEffect, useRef, useCallback, Fragment } from "react";
import {
  Button,
  CodeBlock,
  CodeBlockAction,
  CodeBlockCode,
  ClipboardCopyButton,
  Dropdown,
  DropdownItem,
  DropdownList,
  ExpandableSection,
  MenuToggle,
  Spinner,
  type MenuToggleElement,
} from "@patternfly/react-core";
import type { ProcessedEvent } from "../types/activity";
import { StreamEvent } from "../hooks/useDataStream";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { markdownSanitizeSchema } from "../lib/markdown-sanitize";
import { isSubAgentToolCall, detectArtifactKind } from "../types/deep-agent";
import { SubAgentIndicator } from "./SubAgentIndicator";
import { ArtifactViewer } from "./ArtifactViewer";
import { McpAppHostFromToolCall } from "./McpAppHost";
import { TodoStrip } from "./TodoStrip";
import { FeedbackButtons, FeedbackCommentBox, useFeedback } from "./FeedbackButtons";
import { CustomDataRenderer } from "./CustomDataRenderer";
import { parseMcpApp } from "../types/mcp-apps";
import { ChatbotContent } from "@patternfly/chatbot/dist/esm/ChatbotContent";
import { MessageBox, type MessageBoxHandle } from "@patternfly/chatbot/dist/esm/MessageBox";
import "@patternfly/chatbot/dist/css/main.css";
import { ChatBubble } from "./chat/ChatBubble";
import "./rich-content.css";
import "./sub-agent.css";
import "./chat/chat-view.css";

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
    /<redacted_thinking>([\s\S]*?)<\/redacted_thinking>/gi,
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
  const main = markdownForDisplay || (thinkingText ? '' : extractMessageText(content));
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

function MarkdownPre({ children }: MdComponentProps) {
  const [copied, setCopied] = useState(false);
  const codeId = useId();
  const codeText = useMemo(() => getPlainTextFromReactNode(children), [children]);

  const handleCopy = () => {
    void navigator.clipboard.writeText(codeText).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <CodeBlock
      className="app-codeblock"
      actions={
        <CodeBlockAction>
          <ClipboardCopyButton
            id={`copy-${codeId}`}
            textId={`code-${codeId}`}
            aria-label={copied ? 'Copied' : 'Copy code'}
            onClick={handleCopy}
            exitDelay={copied ? 1500 : 600}
            variant="plain"
          >
            {copied ? 'Copied' : 'Copy code'}
          </ClipboardCopyButton>
        </CodeBlockAction>
      }
    >
      <CodeBlockCode id={`code-${codeId}`}>{codeText.replace(/\n$/, '')}</CodeBlockCode>
    </CodeBlock>
  );
}

function MessageCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="plain"
      size="sm"
      isDisabled={text.length === 0}
      aria-label={copied ? 'Copied' : 'Copy message'}
      icon={copied ? <CheckIcon /> : <CopyIcon />}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2000);
        });
      }}
    />
  );
}

function BotAvatar() {
  return <RobotIcon />;
}

/** Assistant message bubble with its copy/feedback actions and comment box. */
function AssistantBubble({
  isLastAiInTurn,
  copyText,
  messageId,
  chatId,
  traceId,
  userId,
  existingFeedback,
  plain,
  meta,
  children,
}: {
  isLastAiInTurn: boolean;
  copyText: string;
  messageId: string;
  chatId: string;
  traceId: string | null;
  userId?: string;
  existingFeedback: 'up' | 'down' | null;
  /** Tool-call / sub-agent messages: full width, cards sit on the transcript. */
  plain: boolean;
  meta?: ReactNode;
  children: ReactNode;
}) {
  const fb = useFeedback({ messageId, traceId, chatId, userId, existingFeedback });

  return (
    <ChatBubble
      role="assistant"
      htmlRole="article"
      aria-label="Message from assistant"
      avatar={<BotAvatar />}
      wide={plain}
      className={plain ? 'chat-bubble--plain' : undefined}
      actions={
        <>
          {isLastAiInTurn && (
            <>
              <MessageCopyButton text={copyText} />
              <FeedbackButtons fb={fb} />
            </>
          )}
          <span className="app-ai-badge" aria-label="AI-generated content">
            <RobotIcon aria-hidden="true" />
            AI-generated
          </span>
        </>
      }
      footer={
        <>
          {isLastAiInTurn && <FeedbackCommentBox fb={fb} />}
          {meta}
        </>
      }
    >
      {children}
    </ChatBubble>
  );
}

/* Typography lives in rich-content.css (.app-markdown); elements stay plain. */
const mdComponents = {
  a: ({ children, href }: MdComponentProps) => (
    <a href={href as string} target="_blank" rel="noopener noreferrer">
      {children}
      <span className="pf-v6-screen-reader"> (opens in new tab)</span>
    </a>
  ),
  pre: MarkdownPre,
  table: ({ children }: MdComponentProps) => (
    <div className="app-markdown__table">
      <table>{children}</table>
    </div>
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

  if (isEditing) {
    return (
      <ChatBubble
        role="user"
        htmlRole="article"
        aria-label="Message from human"
        wide
        className="chat-bubble--editing"
      >
        <div className="app-stack">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="app-chat-edit-input"
            aria-label="Edit message"
          />
          <div className="app-message-actions">
            <Button variant="primary" size="sm" onClick={() => saveEdit()} aria-label="Save edited message">
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={() => cancelEdit()} aria-label="Cancel editing message">
              Cancel
            </Button>
          </div>
        </div>
      </ChatBubble>
    );
  }

  return (
    <ChatBubble
      role="user"
      htmlRole="article"
      aria-label="Message from human"
      actions={
        <>
          <MessageCopyButton text={plain} />
          <Button
            variant="plain"
            size="sm"
            onClick={() => startEdit()}
            aria-label="Edit message"
            isDisabled={!canEdit}
            icon={<PencilAltIcon />}
          />
        </>
      }
    >
      <div className="app-markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]} components={mdComponents}>
          {plain}
        </ReactMarkdown>
      </div>
    </ChatBubble>
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
    <>
      {thinkingText.length > 0 && (
        <div className="app-thinking">
          <ExpandableSection
            toggleText="Thinking..."
            isExpanded={thinkingExpanded}
            onToggle={(_e, expanded) => setThinkingExpanded(expanded)}
            isIndented
            className="pf-v6-u-mb-0"
          >
            <div className="app-subagent-box">
              {thinkingText}
            </div>
          </ExpandableSection>
        </div>
      )}
      {bodyMd.length > 0 && (
        <div className="app-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[[rehypeSanitize, markdownSanitizeSchema]]} components={mdComponents}>{bodyMd}</ReactMarkdown>
        </div>
      )}
      {customData && <CustomDataRenderer data={customData} />}
    </>
  );
};

interface AIMessageRendererProps {
  message: Message;
  approvalBindings?: Map<string, ToolApproval>;
}

export function AIMessageRenderer({ message, approvalBindings }: AIMessageRendererProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const messageKey = JSON.stringify(message);
  const userCollapsed = useRef(new Set<string>());
  const userExpanded = useRef(new Set<string>());
  useEffect(() => {
    const regular = message.type === 'ai' && Array.isArray(message.tool_calls)
      ? message.tool_calls.filter(call => !isSubAgentToolCall(call) && call.name !== 'write_todos') : [];
    setExpandedItems(previous => {
      const next = new Set(previous);
      regular.forEach((call, index) => {
        const key = `${message.id}-${index}`;
        if (call.id && approvalBindings?.has(call.id) && !userCollapsed.current.has(key)) next.add(key);
        if ((call as { content?: unknown }).content != null && !userExpanded.current.has(key)) next.delete(key);
      });
      return next.size === previous.size && [...next].every(key => previous.has(key)) ? previous : next;
    });
  }, [messageKey, message, approvalBindings]);

  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (prev.has(itemId)) {
        next.delete(itemId);
        userCollapsed.current.add(itemId);
        userExpanded.current.delete(itemId);
      } else {
        next.add(itemId);
        userCollapsed.current.delete(itemId);
        userExpanded.current.add(itemId);
      }
      return next;
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
        <div className="app-stack" aria-live="off">
          {subAgentCalls.map((toolCall, idx) => {
            return (
              <SubAgentIndicator
                key={`${message.id}-sa-${idx}`}
                toolCall={toolCall as any}
                messageId={message.id ?? ''}
                index={idx}
                approval={toolCall.id ? approvalBindings?.get(toolCall.id) : undefined}
              />
            );
          })}

          {regularCalls.length > 0 && (
            <div className="app-fill-width">
              <div className="app-stack">
                {regularCalls.map((toolCall, idx) => {
                  const itemId = `${message.id}-${idx}`;
                  const isExpanded = expandedItems.has(itemId);
                  const approval = toolCall.id ? approvalBindings?.get(toolCall.id) : undefined;
                  const needsApproval = Boolean(approval && !approval.decision);
                  const mcpAppDesc = parseMcpApp((toolCall as Record<string, unknown>).mcpApp);
                  const hasMcpApp = Boolean(mcpAppDesc);
                  // Keep the tool body mounted when an MCP App is present so collapse hides
                  // the iframe instead of destroying it (host teardown runs on real unmount).
                  const keepToolBodyMounted = isExpanded || (!needsApproval && hasMcpApp);

                  return (
                    <div
                      key={itemId}
                      data-interrupt-id={approval?.interruptId}
                      data-action-index={approval?.actionIndex}
                      className={needsApproval ? "app-toolcall app-toolcall--needs-approval" : "app-toolcall"}
                    >
                      <button
                        onClick={() => toggleExpand(itemId)}
                        aria-expanded={isExpanded}
                        aria-controls={`tool-body-${itemId}`}
                        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} tool call: ${toolCall.name}`}
                        className="app-toolcall__header"
                      >
                        <div>
                          <div>
                            <div className="app-toolcall__title">
                              <code className="app-toolcall__name">{toolCall.name}</code>
                              {(toolCall as Record<string, unknown>).status === 'error' ? (
                                <ExclamationCircleIcon color="var(--pf-t--global--icon--color--status--danger--default)" aria-hidden="true" />
                              ) : (toolCall as Record<string, unknown>).content != null ? (
                                <CheckCircleIcon color="var(--pf-t--global--icon--color--status--success--default)" aria-hidden="true" />
                              ) : (
                                <Spinner size="md" aria-label="Running" />
                              )}
                            </div>
                            <div className={(toolCall as Record<string, unknown>).status === 'error' ? 'app-toolcall__subtitle app-toolcall__subtitle--error' : 'app-toolcall__subtitle'}>
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
                          <AngleDownIcon aria-hidden="true" />
                        ) : (
                          <AngleRightIcon aria-hidden="true" />
                        )}
                      </button>

                      {keepToolBodyMounted && (
                        <div
                          id={`tool-body-${itemId}`}
                          className="app-toolcall__panel"
                          hidden={!isExpanded}
                        >
                          <div className="app-toolcall__body">
                            {isExpanded && (
                              <>
                                <div className="app-toolcall__label">Arguments</div>
                                <pre className="app-subagent-box">
                                  {JSON.stringify(toolCall.args, null, 2)}
                                </pre>
                              </>
                            )}
                            {!needsApproval && hasMcpApp && (
                              <>
                                {isExpanded && (
                                  <div className="app-toolcall__label">
                                    Interactive UI
                                  </div>
                                )}
                                <McpAppHostFromToolCall
                                  mcpAppRaw={(toolCall as Record<string, unknown>).mcpApp}
                                  toolName={toolCall.name}
                                  toolCancelled={
                                    (toolCall as Record<string, unknown>).content != null &&
                                    !mcpAppDesc?.result
                                  }
                                  className="app-toolcall__mcp-app"
                                />
                              </>
                            )}
                            {isExpanded && !needsApproval && (
                              <>
                                <div className={(toolCall as Record<string, unknown>).status === 'error' ? 'app-toolcall__label app-toolcall__label--error' : 'app-toolcall__label'}>
                                  {(toolCall as Record<string, unknown>).status === 'error'
                                    ? 'Error'
                                    : (toolCall as Record<string, unknown>).content != null
                                      ? 'Result'
                                      : 'Running...'}
                                </div>
                                {(() => {
                                  const raw = (toolCall as Record<string, unknown>).content;
                                  if (raw == null) return <p className="app-toolcall__waiting">Waiting...</p>;
                                  const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2);
                                  const kind = detectArtifactKind(text);
                                  if (kind !== 'text' && text.length > 100) {
                                    return <ArtifactViewer content={text} title={`${toolCall.name} result`} />;
                                  }
                                  return (
                                    <pre className="app-subagent-box">
                                      {text}
                                    </pre>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                        </div>
                      )}
                      {approval && <ToolApprovalControls approval={approval} />}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {customData && (
            <div className="app-fill-width app-toolcall-extra">
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
  }, [messageKey, expandedItems, approvalBindings]);

  return (
    <div className="app-stack">
      {renderMessage}
    </div>
  );
}

interface ChatMessagesViewProps {
  messages: Message[];
  streamEvents?: StreamEvent[];
  isLoading: boolean;
  pendingInterrupts?: InterruptInfo[];
  isApprovalBusy?: boolean;
  isResuming?: boolean;
  onInterruptResume?: ApprovalSubmission;
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
  /** Extra controls rendered at the right of the chat header bar (next to export). */
  headerActions?: React.ReactNode;
}

export function ChatMessagesView({
  messages,
  isLoading,
  isResuming = false,
  isApprovalBusy = false,
  pendingInterrupts = [],
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
  headerActions,
}: ChatMessagesViewProps) {
  const approvalsDisabled = isResuming || isApprovalBusy;
  const approvals = useInterruptApprovals(pendingInterrupts, approvalsDisabled, onInterruptResume, onAlwaysAllow, isResuming);
  const { bindings, unmatched } = bindToolApprovals(messages, approvals);
  const pendingInterrupt = pendingInterrupts[0];
  const bottomRef = useRef<HTMLDivElement>(null);
  const setScrollArea = useCallback((node: MessageBoxHandle | null) => {
    scrollAreaRef.current = node;
  }, [scrollAreaRef]);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const prevPendingInterrupt = useRef(pendingInterrupt);
  const prevIsLoading = useRef(isLoading);
  const [srAnnouncement, setSrAnnouncement] = useState('');

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
    const text = markdownForDisplay || extractMessageText(lastAiMessage.content);
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
  }, [messages, pendingInterrupts]);

  const showExport = Boolean(onExportMarkdown && onExportJson && messages.length > 0);

  return (
    <div className="app-chat-view">
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pf-v6-screen-reader"
      >
        {srAnnouncement}
      </div>
      {(showExport || headerActions) && (
        <div className="app-chat-header-actions" data-testid="chat-header-actions">
          {headerActions}
          {showExport && (
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
                icon={<DownloadIcon />}
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
          )}
        </div>
      )}
      <ChatbotContent className="app-chat-transcript">
        <MessageBox ref={setScrollArea} ariaLabel="Chat transcript" className="app-chat-messagebox chat-scroll">
          <div role="log" aria-label="Chat messages" aria-live="off" aria-busy={isLoading} className="app-chat-log">
            {messages.map((message, messageIndex) => {
              if (message.type === 'tool') {
                return <Fragment key={message.id ?? `m-${messageIndex}`} />;
              }
              const key = message.id || `msg-${messageIndex}`;
              if (message.type === "human") {
                return (
                  <HumanMessageBubble
                    key={key}
                    message={message}
                    messageIndex={messageIndex}
                    isLastHuman={messageIndex === lastHumanMessageIndex}
                    isLoading={isLoading}
                    onEditMessage={onEditMessage}
                  />
                );
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
              const hasToolCalls = message.type === 'ai' && Array.isArray(message.tool_calls) && message.tool_calls.length > 0;

              return (
                <AssistantBubble
                  key={key}
                  isLastAiInTurn={isLastAiInTurn}
                  copyText={copyText}
                  messageId={message.id ?? `msg-${messageIndex}`}
                  chatId={chatId}
                  traceId={traceId}
                  userId={userId}
                  existingFeedback={messageFeedback[message.id ?? `msg-${messageIndex}`] ?? null}
                  plain={hasToolCalls}
                  meta={showResponseTiming && (
                    <div aria-hidden="true" className="app-chat-meta">
                      <div>
                        Response time: {(lastResponseTiming.totalDurationMs / 1000).toFixed(1)}s
                      </div>
                      {lastResponseTiming.timeToFirstTokenMs != null && (
                        <div className="app-chat-meta__secondary">
                          First token: {Math.round(lastResponseTiming.timeToFirstTokenMs)}ms
                        </div>
                      )}
                    </div>
                  )}
                >
                  <AIMessageRenderer
                    message={message}
                    approvalBindings={bindings}
                  />
                </AssistantBubble>
              );
            })}

            {isLoading && (
              <ChatBubble
                role="assistant"
                htmlRole="status"
                aria-live="polite"
                aria-label="Agent is thinking"
                avatar={<BotAvatar />}
              >
                <div className="app-typing">
                  <span className="app-typing__dots">
                    <span className="app-chat-typing-dot" />
                    <span className="app-chat-typing-dot" />
                    <span className="app-chat-typing-dot" />
                  </span>
                  Thinking...
                </div>
              </ChatBubble>
            )}

            {showNoResponse && (
              <ChatBubble role="assistant" className="chat-bubble--danger" avatar={<ExclamationCircleIcon />}>
                <p className="app-chat-error-note">
                  {errorMessage
                    ? 'The agent encountered an error:'
                    : 'The agent didn\u0027t respond. This could be a temporary issue.'}
                </p>
                {errorMessage && (
                  <p className="app-chat-error-detail">
                    {errorMessage}
                  </p>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  icon={<UndoIcon />}
                  onClick={() => onRetry?.()}
                  aria-label="Retry operation"
                >
                  Retry
                </Button>
              </ChatBubble>
            )}
            {!showNoResponse && errorMessage && !isLoading && (
              <ChatBubble role="assistant" className="chat-bubble--danger" avatar={<ExclamationCircleIcon />}>
                <p className="app-chat-error-note">The agent encountered an error:</p>
                <p className="app-chat-error-detail">
                  {errorMessage}
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  icon={<UndoIcon />}
                  onClick={() => onRetry?.()}
                  aria-label="Retry operation"
                >
                  Retry
                </Button>
              </ChatBubble>
            )}
            {unmatched.map((approval, index) => {
              // Some subgraph tool calls are absent from parent-thread messages.
              // Show their exact request in the same tool-card UI; never guess an owner.
              const id = `pending-${approval.interruptId ?? index}-${approval.actionIndex}`;
              const message = { type: 'ai', id, content: '', tool_calls: [{ id, name: approval.request.name, args: approval.request.args }] } as Message;
              return (
                <ChatBubble key={approval.key} role="assistant" avatar={<BotAvatar />} wide className="chat-bubble--plain">
                  <AIMessageRenderer message={message} approvalBindings={new Map([[id, approval]])} />
                </ChatBubble>
              );
            })}
            {interruptContent}
            <div ref={bottomRef} />
          </div>
        </MessageBox>
      </ChatbotContent>
      <TodoStrip messages={messages} isLoading={isLoading} />
      <McpStatusPanel mcpEvents={mcpEvents} />
      <div>
        <div className="app-chat-composer-wrap">
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
