import type React from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { CheckCircle, ChevronDown, ChevronRight, Loader2, Settings } from "lucide-react";
import { InputForm } from "./InputForm";
import { useState, ReactNode, useMemo, useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import {
  ProcessedEvent,
} from "./ActivityTimeline";
import { StreamEvent } from "../hooks/useDataStream";
import ReactMarkdown from "react-markdown";

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
    <h2 className={cn("text-xl font-bold mt-3 mb-2 text-foreground", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }: MdComponentProps) => (
    <h3 className={cn("text-lg font-bold mt-3 mb-1 text-foreground", className)} {...props}>
      {children}
    </h3>
  ),
  p: ({ className, children, ...props }: MdComponentProps) => (
    <p className={cn("mb-3 leading-7 text-foreground", className)} {...props}>
      {children}
    </p>
  ),
  a: ({ className, children, href, ...props }: MdComponentProps) => (
    <Badge className="text-xs mx-0.5">
      <a
        className={cn("text-primary hover:text-primary/80 text-xs", className)}
        href={href as string}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    </Badge>
  ),
  ul: ({ className, children, ...props }: MdComponentProps) => (
    <ul className={cn("list-disc pl-6 mb-3", className)} {...props}>
      {children}
    </ul>
  ),
  ol: ({ className, children, ...props }: MdComponentProps) => (
    <ol className={cn("list-decimal pl-6 mb-3", className)} {...props}>
      {children}
    </ol>
  ),
  li: ({ className, children, ...props }: MdComponentProps) => (
    <li className={cn("mb-1", className)} {...props}>
      {children}
    </li>
  ),
  blockquote: ({ className, children, ...props }: MdComponentProps) => (
    <blockquote
      className={cn(
        "border-l-4 border-border pl-4 italic my-3 text-sm text-muted-foreground",
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
        "bg-muted rounded px-1.5 py-0.5 font-mono text-xs text-foreground",
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
        "bg-muted p-3 rounded-lg overflow-x-auto font-mono text-xs my-3",
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
    <div className="my-3 overflow-x-auto">
      <table className={cn("border-collapse w-full", className)} {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ className, children, ...props }: MdComponentProps) => (
    <thead className={cn("bg-muted", className)} {...props}>
      {children}
    </thead>
  ),
  tbody: ({ className, children, ...props }: MdComponentProps) => (
    <tbody className={cn("", className)} {...props}>
      {children}
    </tbody>
  ),
  tr: ({ className, children, ...props }: MdComponentProps) => (
    <tr
      className={cn("border-b border-border even:bg-muted/50", className)}
      {...props}
    >
      {children}
    </tr>
  ),
  th: ({ className, children, ...props }: MdComponentProps) => (
    <th
      className={cn(
        "border border-border px-3 py-2 text-left font-bold bg-muted",
        className
      )}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ className, children, ...props }: MdComponentProps) => (
    <td
      className={cn("border border-border px-3 py-2", className)}
      {...props}
    >
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
    <div className="rounded-3xl rounded-br-xs break-words min-h-7 bg-primary/10 dark:bg-primary/20 text-foreground max-w-[100%] sm:max-w-[90%] p-3 border border-primary/20">
      <ReactMarkdown components={mdComponents}>
        {extractMessageText(message.content)}
      </ReactMarkdown>
    </div>
  );
};

interface AiMessageBubbleProps {
  message: Message;
}

const AiMessageBubble: React.FC<AiMessageBubbleProps> = ({ message }) => {
  return (
    <div className="relative break-words flex flex-col w-full">
      <div className="w-full prose prose-invert max-w-none dark:prose-invert">
        <ReactMarkdown components={mdComponents}>
          {extractMessageText(message.content)}
        </ReactMarkdown>
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
      return (
        <>
          {message.tool_calls?.map((toolCall, idx) => (
            <div key={`${message.id}-${idx}`} className="bg-primary/5 dark:bg-primary/10 border border-primary/20 rounded-lg overflow-hidden w-full">
              <button
                onClick={() => toggleExpand(`${message.id}-${idx}`)}
                className="w-full flex items-center justify-between p-4 hover:bg-primary/10 dark:hover:bg-primary/15 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Settings className="w-5 h-5 text-primary" />
                  <div className="text-left">
                    <div className="text-sm font-medium text-foreground flex items-center gap-2">
                      {toolCall.name}
                      {(toolCall as Record<string, unknown>).content ? (
                        <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">Tool execution</div>
                  </div>
                </div>
                {expandedItems.has(`${message.id}-${idx}`) ? (
                  <ChevronDown className="w-4 h-4 text-primary" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-primary" />
                )}
              </button>

              {expandedItems.has(`${message.id}-${idx}`) && (
                <div className="px-4 pb-4 border-t border-primary/10">
                  <div className="text-xs text-muted-foreground mb-2 mt-3">Arguments:</div>
                  <pre className="text-xs text-foreground bg-muted p-2 rounded overflow-auto">
                    {JSON.stringify(toolCall.args, null, 2)}
                  </pre>
                  <div className="text-xs text-muted-foreground mb-2 mt-3">
                    {(toolCall as Record<string, unknown>).content ? 'Result:' : 'Running...'}
                  </div>
                  <pre className="text-xs text-foreground bg-muted p-2 rounded overflow-auto">
                    {JSON.stringify((toolCall as Record<string, unknown>).content, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </>
      );
    }

    if (isNormalMessage) {
      return <AiMessageBubble message={message} />;
    }

    return null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageKey, expandedItems]);

  return (
    <div className="space-y-2 mb-4 w-full">
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
  onCancel,
  onNewChat,
}: ChatMessagesViewProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto" ref={scrollAreaRef}>
        <div className="p-4 md:p-6 space-y-2 max-w-4xl mx-auto pt-8">
          {messages.filter(m => {
            if (m.type === 'human') return true;
            if (m.type === 'tool') return false;
            if (m.type === 'ai') return true;
            return true;
          }).map((message, index) => (
            <div key={message.id || `msg-${index}`} className="space-y-3">
              <div
                className={cn(
                  "flex items-start gap-3",
                  message.type === "human" ? "justify-end" : ""
                )}
              >
                {message.type === "human" ? (
                  <HumanMessageBubble message={message} />
                ) : (
                  <div className="w-full max-w-[85%] md:max-w-[80%]">
                    <AIMessageRenderer message={message} />
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center py-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Processing...
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <InputForm
        onSubmit={onSubmit}
        isLoading={isLoading}
        onCancel={onCancel}
        onNewChat={onNewChat}
        hasHistory={messages.length > 0}
      />
    </div>
  );
}
