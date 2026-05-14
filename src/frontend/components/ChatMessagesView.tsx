import type React from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { AlertCircle, CheckCircle, ChevronDown, ChevronRight, Loader2, RotateCcw, Settings, Bot, User } from "lucide-react";
import { InputForm } from "./InputForm";
import { useState, ReactNode, useMemo, useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { Label } from "@patternfly/react-core";
import {
  ProcessedEvent,
} from "./ActivityTimeline";
import { StreamEvent } from "../hooks/useDataStream";
import ReactMarkdown from "react-markdown";
import { isSubAgentToolCall, detectArtifactKind } from "../types/deep-agent";
import { SubAgentIndicator } from "./SubAgentIndicator";
import { ArtifactViewer } from "./ArtifactViewer";
import { TodoStrip } from "./TodoStrip";

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

type MdComponentProps = {
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
};

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
  pre: ({ className, children, ...props }: MdComponentProps) => (
    <pre
      className={cn(
        "bg-muted border border-border p-4 rounded-xl overflow-x-auto font-mono text-[13px] my-3",
        className
      )}
      {...props}
    >
      {children}
    </pre>
  ),
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
  img: ({ className, ...props }: MdComponentProps) => (
    <img className={cn("w-full h-auto rounded-lg", className)} {...props} />
  ),
};

interface HumanMessageBubbleProps {
  message: Message;
}

const HumanMessageBubble: React.FC<HumanMessageBubbleProps> = ({ message }) => {
  return (
    <div className="flex items-end gap-3 justify-end">
      <div className="rounded-2xl rounded-br-sm break-words max-w-[85%] sm:max-w-[75%] px-4 py-3 bg-primary text-primary-foreground shadow-card">
        <div className="text-sm leading-relaxed [&_p]:!text-primary-foreground [&_p]:!mb-1.5 [&_p:last-child]:!mb-0">
          <ReactMarkdown components={mdComponents}>
            {extractMessageText(message.content)}
          </ReactMarkdown>
        </div>
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
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full gradient-brand flex items-center justify-center shadow-sm">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1 min-w-0 max-w-[85%] sm:max-w-[80%]">
        <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-card">
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
            <ReactMarkdown components={mdComponents}>
              {extractMessageText(message.content)}
            </ReactMarkdown>
          </div>
        </div>
      </div>
    </div>
  );
};

export function AIMessageRenderer({ message }: { message: Message }) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const messageKey = JSON.stringify(message);

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
            />
          ))}

          {regularCalls.length > 0 && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
                <Settings className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0 space-y-2">
                {regularCalls.map((toolCall, idx) => (
                  <div key={`${message.id}-${idx}`} className="bg-card border border-border rounded-xl overflow-hidden shadow-card">
                    <button
                      onClick={() => toggleExpand(`${message.id}-${idx}`)}
                      className="w-full flex items-center justify-between p-3.5 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="text-left">
                          <div className="text-sm font-medium text-foreground flex items-center gap-2">
                            <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">{toolCall.name}</code>
                            {(toolCall as Record<string, unknown>).content ? (
                              <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
                            ) : (
                              <Loader2 className="w-4 h-4 text-primary animate-spin" />
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">Tool execution</div>
                        </div>
                      </div>
                      {expandedItems.has(`${message.id}-${idx}`) ? (
                        <ChevronDown className="w-4 h-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>

                    {expandedItems.has(`${message.id}-${idx}`) && (
                      <div className="px-4 pb-4 border-t border-border">
                        <div className="text-xs font-medium text-muted-foreground mb-2 mt-3 uppercase tracking-wider">Arguments</div>
                        <pre className="text-xs text-foreground bg-muted border border-border p-3 rounded-lg overflow-auto font-mono">
                          {JSON.stringify(toolCall.args, null, 2)}
                        </pre>
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
                      </div>
                    )}
                  </div>
                ))}
              </div>
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
  }, [messageKey, expandedItems]);

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
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  onSubmit: (inputValue: string) => void;
  onRetry?: () => void;
  onCancel: () => void;
  onNewChat?: () => void;
  liveActivityEvents: ProcessedEvent[];
  historicalActivities: Record<string, ProcessedEvent[]>;
}

export function ChatMessagesView({
  messages,
  isLoading,
  scrollAreaRef,
  onSubmit,
  onRetry,
  onCancel,
  onNewChat,
}: ChatMessagesViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const lastMessage = messages[messages.length - 1];
  const rawNoResponse = !isLoading && messages.length > 0 && lastMessage?.type === 'human';
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

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-y-auto chat-scroll" ref={scrollAreaRef}>
        <div className="p-4 md:p-6 space-y-5 max-w-3xl mx-auto pt-8">
          {messages.filter(m => {
            if (m.type === 'human') return true;
            if (m.type === 'tool') return false;
            if (m.type === 'ai') return true;
            return true;
          }).map((message, index) => (
            <div
              key={message.id || `msg-${index}`}
              className="animate-fadeInUpSmooth"
              style={{ animationDelay: `${Math.min(index * 30, 150)}ms`, opacity: 0 }}
            >
              {message.type === "human" ? (
                <HumanMessageBubble message={message} />
              ) : (
                <AIMessageRenderer message={message} />
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex items-start gap-3 animate-fadeIn">
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
                  onClick={() => onRetry?.()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Retry
                </button>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <TodoStrip messages={messages} />
      <div className="border-t border-border bg-background/80 glass">
        <div className="max-w-3xl mx-auto">
          <InputForm
            onSubmit={onSubmit}
            isLoading={isLoading}
            onCancel={onCancel}
            onNewChat={onNewChat}
            hasHistory={messages.length > 0}
          />
        </div>
      </div>
    </div>
  );
}
