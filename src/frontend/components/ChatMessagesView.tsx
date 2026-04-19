import type React from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { ScrollArea } from "./ui/scroll-area";
import { CheckCircle, ChevronDown, ChevronRight, Copy, CopyCheck, Loader2, ThumbsUp, ThumbsDown } from "lucide-react";
import { getToolIcon } from "../lib/toolIcons";
import { InputForm } from "./InputForm";
import { useState, ReactNode, useMemo } from "react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import {
  ProcessedEvent,
} from "./ActivityTimeline";
import { StreamEvent } from "../hooks/useDataStream";
import ReactMarkdown from "react-markdown";
import { TodoListRenderer, isWriteTodosCall, isWriteTodosResult, extractTodos } from "./TodoListRenderer";
import type { TodoItem } from "./TodoListRenderer";
import { FeedbackModal } from "./FeedbackModal";
import { submitFeedback } from "../services/agent-rest";

// Markdown component props type from former ReportView
type MdComponentProps = {
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
};

// Markdown components (from former ReportView.tsx)
const mdComponents = {
  h1: ({ className, children, ...props }: MdComponentProps) => (
    <h1 className={cn("text-2xl font-bold mt-4 mb-2", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }: MdComponentProps) => (
    <h2 className={cn("text-xl font-bold mt-3 mb-2", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }: MdComponentProps) => (
    <h3 className={cn("text-lg font-bold mt-3 mb-1", className)} {...props}>
      {children}
    </h3>
  ),
  p: ({ className, children, ...props }: MdComponentProps) => (
    <p className={cn("mb-3 leading-7", className)} {...props}>
      {children}
    </p>
  ),
  a: ({ className, children, href, ...props }: MdComponentProps) => (
    <Badge className="text-xs mx-0.5">
      <a
        className={cn("text-blue-400 hover:text-blue-300 text-xs", className)}
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
        "border-l-4 border-neutral-600 pl-4 italic my-3 text-sm",
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
        "bg-neutral-900 rounded px-1 py-0.5 font-mono text-xs",
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
        "bg-neutral-900 p-3 rounded-lg overflow-x-auto font-mono text-xs my-3",
        className
      )}
      {...props}
    >
      {children}
    </pre>
  ),
  hr: ({ className, ...props }: MdComponentProps) => (
    <hr className={cn("border-neutral-600 my-4", className)} {...props} />
  ),
  table: ({ className, children, ...props }: MdComponentProps) => (
    <div className="my-3 overflow-x-auto">
      <table className={cn("border-collapse w-full", className)} {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ className, children, ...props }: MdComponentProps) => (
    <thead className={cn("bg-neutral-800", className)} {...props}>
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
      className={cn(
        "border-b border-neutral-700 even:bg-neutral-800 odd:bg-neutral-900",
        className
      )}
      {...props}
    >
      {children}
    </tr>
  ),
  th: ({ className, children, ...props }: MdComponentProps) => (
    <th
      className={cn(
        "border border-neutral-700 px-3 py-2 text-left font-bold bg-neutral-800",
        className
      )}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ className, children, ...props }: MdComponentProps) => (
    <td
      className={cn("border border-neutral-600 px-3 py-2", className)}
      {...props}
    >
      {children}
    </td>
  ),
  img: ({ className, ...props }: MdComponentProps) => (
    <img className={cn("w-full h-auto", className)} {...props} />
  ),
};

// Props for HumanMessageBubble
interface HumanMessageBubbleProps {
  message: Message;
  mdComponents: typeof mdComponents;
}

// HumanMessageBubble Component
const HumanMessageBubble: React.FC<HumanMessageBubbleProps> = ({
  message,
}) => {
  return (
    <div
      className={`text-white rounded-3xl break-words min-h-7 bg-neutral-700 max-w-[100%] sm:max-w-[90%] p-3 rounded-br-xs`}
    >
      <ReactMarkdown components={mdComponents}>
        {typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content)}
      </ReactMarkdown>
    </div>
  );
};

// Props for AiMessageBubble
interface AiMessageBubbleProps {
  message: Message;
  mdComponents?: typeof mdComponents;
  handleCopy?: (text: string, messageId: string) => void;
  copiedMessageId?: string | null;
  onFeedback?: (messageId: string, traceId: string, feedbackType: "positive" | "negative") => void;
}

// AiMessageBubble Component
const AiMessageBubble: React.FC<AiMessageBubbleProps> = ({
  message,
  handleCopy = () => { },
  copiedMessageId = '',
  onFeedback = () => { },
}) => {
  const messageContent = typeof message.content === "string"
    ? message.content
    : JSON.stringify(message.content);

  const traceId = (message as any).trace_id || '';

  return (
    <div className={`relative break-words flex flex-col w-full group`}>
      <div className="w-full prose prose-invert max-w-none">
        <ReactMarkdown components={mdComponents}>
          {messageContent}
        </ReactMarkdown>
      </div>
      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => handleCopy(messageContent, message.id || '')}
          className="p-1.5 rounded hover:bg-neutral-700/50 transition-colors"
          title="Copy"
        >
          {copiedMessageId === message.id ? (
            <CopyCheck className="w-4 h-4 text-green-400" />
          ) : (
            <Copy className="w-4 h-4 text-neutral-400" />
          )}
        </button>
        {traceId && (
          <>
            <button
              onClick={() => onFeedback(message.id || '', traceId, "positive")}
              className="p-1.5 rounded hover:bg-neutral-700/50 transition-colors"
              title="Good response"
            >
              <ThumbsUp className="w-4 h-4 text-neutral-400 hover:text-green-400" />
            </button>
            <button
              onClick={() => onFeedback(message.id || '', traceId, "negative")}
              className="p-1.5 rounded hover:bg-neutral-700/50 transition-colors"
              title="Bad response"
            >
              <ThumbsDown className="w-4 h-4 text-neutral-400 hover:text-red-400" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};

interface ChatMessagesViewProps {
  messages: Message[];
  streamEvents?: StreamEvent[];
  isLoading: boolean;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  onSubmit: (inputValue: string) => void;
  onCancel: () => void;
  liveActivityEvents: ProcessedEvent[];
  historicalActivities: Record<string, ProcessedEvent[]>;
}

interface AIMessageRendererProps {
  message: Message;
  latestTodos?: TodoItem[];
  strikeAllTodos?: boolean;
  handleCopy?: (text: string, messageId: string) => void;
  copiedMessageId?: string | null;
  onFeedback?: (messageId: string, traceId: string, feedbackType: "positive" | "negative") => void;
}

export function AIMessageRenderer({ message, latestTodos, strikeAllTodos = false, handleCopy, copiedMessageId, onFeedback }: AIMessageRendererProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

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
    const isToolCallResult = message.type === 'tool';
    const isNormalMessage = message.type === 'ai' && (!Array.isArray(message?.tool_calls) || message?.tool_calls?.length === 0);

    if (isToolCallStart) {
      const toolCalls = message.tool_calls ?? [];
      const nonTodoToolCalls = toolCalls.filter(tc => !isWriteTodosCall(tc));
      const hasTodoCall = toolCalls.some(tc => isWriteTodosCall(tc));

      const elements: React.ReactNode[] = [];

      if (hasTodoCall && latestTodos) {
        elements.push(
          <TodoListRenderer key="aggregated-todos" todos={latestTodos} strikeAll={strikeAllTodos} />
        );
      }

      for (let idx = 0; idx < nonTodoToolCalls.length; idx++) {
        const toolCall = nonTodoToolCalls[idx];
        const ToolIcon = getToolIcon(toolCall.name);
        const stableId = message.id || 'tc';
        elements.push(
          <div key={`${stableId}-${idx}`} className="bg-blue-900/20 border border-blue-700/30 rounded-lg overflow-hidden w-full">
            <button
              onClick={() => toggleExpand(`${stableId}-${idx}`)}
              className="w-full flex items-center justify-between p-4 hover:bg-blue-800/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <ToolIcon className="w-5 h-5 text-blue-400" />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-blue-100">{toolCall.name}</span>
                  {
                    (toolCall as any).content ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                    )
                  }
                </div>
              </div>
              {expandedItems.has(`${stableId}-${idx}`) ? (
                <ChevronDown className="w-4 h-4 text-blue-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-blue-400" />
              )}
            </button>

            {expandedItems.has(`${stableId}-${idx}`) && (
              <div className="px-4 pb-4 border-t border-blue-700/20">
                <div className="text-xs text-blue-200/60 mb-2">Arguments:</div>
                <pre className="text-xs text-blue-100 bg-blue-950/30 p-2 rounded overflow-y-auto max-h-60 whitespace-pre-wrap break-words">
                  {JSON.stringify(toolCall.args, null, 2)}
                </pre>
                <div className="text-xs text-blue-200/60 mb-2">
                  {
                    (toolCall as any).content ? 'Result:' : 'Running...:'
                  }
                </div>
                <pre className="text-xs text-green-100 bg-green-950/30 p-2 rounded overflow-y-auto max-h-60 whitespace-pre-wrap break-words">
                  {JSON.stringify((toolCall as any).content, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );
      }

      if (elements.length === 0) return null;
      return <>{elements}</>;
    }


    if (isToolCallResult) {
      return (
        <>
          <div key={message.id} className="bg-green-900/20 border border-green-700/30 rounded-lg overflow-hidden ml-6 w-full">
            <button
              onClick={() => toggleExpand(message.id || '')}
              className="w-full flex items-center justify-between p-3 hover:bg-green-800/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <div className="text-left">
                  <div className="text-sm font-medium text-green-100">
                    {message.name} result
                  </div>
                  <div className="text-xs text-green-200/60">
                    Execution completed
                  </div>
                </div>
              </div>
              {expandedItems.has(message.id || '') ? (
                <ChevronDown className="w-4 h-4 text-green-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-green-400" />
              )}
            </button>

            {expandedItems.has(message.id || '') && (
              <div className="px-3 pb-3 border-t border-green-700/20">
                <div className="text-xs text-green-200/60 mb-2">Result:</div>
                <pre className="text-xs text-green-100 bg-green-950/30 p-2 rounded overflow-y-auto max-h-60 whitespace-pre-wrap break-words">
                  {typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </>
      );
    }

    if (isNormalMessage) {
      return (
        <AiMessageBubble
          message={message}
          handleCopy={handleCopy}
          copiedMessageId={copiedMessageId}
          onFeedback={onFeedback}
        />
      );
    }

    return null;

  }, [JSON.stringify(message), expandedItems, latestTodos]);

  if (!renderMessage) return null;

  return (
    <div className="w-full max-w-[85%] md:max-w-[80%]">
      <div className="space-y-2 mb-4 w-full">
        {renderMessage}
      </div>
    </div>
  );
}


export function ChatMessagesView({
  messages,
  streamEvents = [],
  isLoading,
  scrollAreaRef,
  onSubmit,
  onCancel,
}: ChatMessagesViewProps) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    isOpen: boolean;
    messageId: string;
    traceId: string;
    feedbackType: "positive" | "negative";
  }>({
    isOpen: false,
    messageId: "",
    traceId: "",
    feedbackType: "positive",
  });

  const handleCopy = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  const handleFeedback = (messageId: string, traceId: string, feedbackType: "positive" | "negative") => {
    if (!traceId) {
      console.error("Cannot submit feedback: trace_id is missing from message");
      return;
    }

    setFeedbackModal({
      isOpen: true,
      messageId,
      traceId,
      feedbackType,
    });
  };

  const handleFeedbackSubmit = async (traceId: string, feedbackType: "positive" | "negative", comment: string) => {
    if (!traceId) {
      console.error("Cannot submit feedback: trace_id is missing");
      return;
    }

    try {
      const value = feedbackType === "positive" ? 1 : 0;
      await submitFeedback(traceId, value, comment);
      console.log("Feedback submitted successfully:", { traceId, feedbackType, comment });
    } catch (error) {
      console.error("Failed to submit feedback:", error);
    }
  };

  const handleFeedbackClose = () => {
    setFeedbackModal({
      isOpen: false,
      messageId: "",
      traceId: "",
      feedbackType: "positive",
    });
  };

  // Strategy for write_todos calls per user turn:
  // - Group messages by conversation turn (based on human messages)
  // - For each turn, show only the LATEST todo state
  // - Display at the FIRST write_todos position in that turn
  // - UX: One todo card per user message, always showing the most up-to-date state
  // - Strike out all todos from previous turns (before the latest human message)
  const todoMeta = useMemo(() => {
    let currentTurn = -1;
    let latestHumanTurn = -1;
    const turnFirstTodoIndex = new Map<number, number>(); // turn -> first message index with todos
    const turnLatestTodos = new Map<number, TodoItem[]>(); // turn -> latest todos for that turn
    const skipIndices = new Set<number>(); // message indices to skip (non-first todos in a turn)

    // First pass: find the latest human message turn
    messages.forEach((msg) => {
      if (msg.type === 'human') {
        latestHumanTurn++;
      }
    });

    // Reset for second pass
    currentTurn = -1;

    messages.forEach((msg, idx) => {
      // New turn starts with human message
      if (msg.type === 'human') {
        currentTurn++;
      }

      // Track todos for current turn
      if (msg.type === 'ai' && Array.isArray(msg.tool_calls) && currentTurn >= 0) {
        for (const tc of msg.tool_calls) {
          if (isWriteTodosCall(tc)) {
            // Record first occurrence for this turn
            if (!turnFirstTodoIndex.has(currentTurn)) {
              turnFirstTodoIndex.set(currentTurn, idx);
            } else if (turnFirstTodoIndex.get(currentTurn) !== idx) {
              // This is not the first occurrence, mark to skip
              skipIndices.add(idx);
            }

            // Always update to latest todos for this turn
            turnLatestTodos.set(currentTurn, extractTodos(tc));
          }
        }
      }
    });

    // Build final map: message index -> todos to display
    const todosByIndex = new Map<number, TodoItem[]>();
    const strikeAllByIndex = new Map<number, boolean>();
    turnFirstTodoIndex.forEach((msgIdx, turn) => {
      const todos = turnLatestTodos.get(turn);
      if (todos) {
        todosByIndex.set(msgIdx, todos);
        // Strike all todos from turns before the latest human turn
        strikeAllByIndex.set(msgIdx, turn < latestHumanTurn);
      }
    });

    return { todosByIndex, skipIndices, strikeAllByIndex };
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 overflow-y-auto" ref={scrollAreaRef}>
        <div className="p-4 md:p-6 space-y-2 max-w-4xl mx-auto pt-16">
          {messages.map((message, index) => {
            if (isWriteTodosResult(message)) {
              return null;
            }

            // Get todos to display at this index (only if it's the first write_todos in a turn)
            const todosToDisplay = todoMeta.todosByIndex.get(index);
            // Skip rendering this message's todos if it's not the first in the turn
            const shouldSkipTodos = todoMeta.skipIndices.has(index);
            // Check if this todo should be struck out (from a previous turn)
            const shouldStrikeAll = todoMeta.strikeAllByIndex.get(index) ?? false;

            const content = message.type === "human" ? (
              <HumanMessageBubble
                message={message}
                mdComponents={mdComponents}
              />
            ) : (
              <AIMessageRenderer
                message={message}
                latestTodos={shouldSkipTodos ? undefined : todosToDisplay}
                strikeAllTodos={shouldStrikeAll}
                handleCopy={handleCopy}
                copiedMessageId={copiedMessageId}
                onFeedback={handleFeedback}
              />
            );

            if (!content) return null;

            return (
              <div key={message.id || `msg-${index}`} className="space-y-3">
                <div
                  className={`flex items-start gap-3 ${message.type === "human" ? "justify-end" : ""
                    }`}
                >
                  {content}
                </div>
              </div>
            );
          })}

          {/* {streamEvents && streamEvents.length > 0 && (
            <div className="mb-3">
              <StreamEventRenderer
                events={streamEvents}
                isLoading={isLoading}
              />
            </div>
          )} */}
          {
            // isLoading &&
            //   (messages.length === 0 ||
            //     messages[messages.length - 1].type === "human") && (
            //     <div className="flex items-start gap-3 mt-3">
            //       {" "}
            //       {/* AI message row structure */}
            //       <div className="relative group max-w-[85%] md:max-w-[80%] rounded-xl p-3 shadow-sm break-words bg-neutral-800 text-neutral-100 rounded-bl-none w-full min-h-[56px]">
            //         {liveActivityEvents.length > 0 ? (
            //           <div className="text-xs">
            //             <ActivityTimeline
            //               processedEvents={liveActivityEvents}
            //               isLoading={true}
            //             />
            //           </div>
            //         ) : (
            //           <div className="flex items-center justify-start h-full">
            //             <Loader2 className="h-5 w-5 animate-spin text-neutral-400 mr-2" />
            //             <span>Processing...</span>
            //           </div>
            //         )}
            //       </div>
            //     </div>
            //   )
          }
        </div>
        {isLoading && (
          <div className="flex items-center gap-2 text-xs text-neutral-500 justify-center py-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            Processing...
          </div>
        )}
      </ScrollArea>
      <InputForm
        onSubmit={onSubmit}
        isLoading={isLoading}
        onCancel={onCancel}
        hasHistory={messages.length > 0}
      />
      <FeedbackModal
        isOpen={feedbackModal.isOpen}
        onClose={handleFeedbackClose}
        feedbackType={feedbackModal.feedbackType}
        messageId={feedbackModal.messageId}
        traceId={feedbackModal.traceId}
        onSubmit={handleFeedbackSubmit}
      />
    </div>
  );
}
