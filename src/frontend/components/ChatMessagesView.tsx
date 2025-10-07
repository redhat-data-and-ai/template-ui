import type React from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { ScrollArea } from "./ui/scroll-area";
import { CheckCircle, ChevronDown, ChevronRight, Copy, CopyCheck, Loader2, Settings } from "lucide-react";
import { InputForm } from "./InputForm";
import { useState, ReactNode, useMemo } from "react";
import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import {
  ProcessedEvent,
} from "./ActivityTimeline";
import { StreamEventRenderer } from "./StreamEventRenderer";
import { StreamEvent, ToolCall } from "../hooks/useDataStream";

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

      <div dangerouslySetInnerHTML={{
        __html: typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content)
      }} />
      {/* <ReactMarkdown components={mdComponents}>
        {typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content)}
      </ReactMarkdown> */}
    </div>
  );
};

// Props for AiMessageBubble
interface AiMessageBubbleProps {
  message: Message;
  mdComponents?: typeof mdComponents;
  handleCopy?: (text: string, messageId: string) => void;
  copiedMessageId?: string | null;
}

// AiMessageBubble Component
const AiMessageBubble: React.FC<AiMessageBubbleProps> = ({
  message,
  handleCopy = () => { },
  copiedMessageId = '',
}) => {
  return (
    <div className={`relative break-words flex flex-col w-full`}>
      <div className="w-full" dangerouslySetInnerHTML={{
        __html: typeof message.content === "string"
          ? message.content
          : JSON.stringify(message.content)
      }} />
      {/* <Button
        variant="default"
        className={`cursor-pointer bg-neutral-700 border-neutral-600 text-neutral-300 self-end ${message.content.length > 0 ? "visible" : "hidden"
          }`}
        onClick={() =>
          handleCopy(
            typeof message.content === "string"
              ? message.content
              : JSON.stringify(message.content),
            message.id!
          )
        }
      >
        {copiedMessageId === message.id ? "Copied" : "Copy"}
        {copiedMessageId === message.id ? <CopyCheck /> : <Copy />}
      </Button> */}
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

export function AIMessageRenderer({ message }: { message: Message }) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (itemId: string) => {
    console.log('toggleExpand : ', itemId);
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
      // const color = (toolCall as any).content ? 'green' : 'blue';
      return (
        <>
          {
            message.tool_calls?.map((toolCall, idx) => (
              <div key={`${message.id}-${idx}`} className="bg-blue-900/20 border border-blue-700/30 rounded-lg overflow-hidden w-full">
                <button
                  onClick={() => toggleExpand(`${message.id}-${idx}`)}
                  className="w-full flex items-center justify-between p-4 hover:bg-blue-800/20 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Settings className="w-5 h-5 text-blue-400" />
                    <div className="text-left">
                      <div className="text-sm font-medium text-blue-100 flex items-center gap-2">
                        {toolCall.name}
                        {
                          (toolCall as any).content ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : (
                            <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                          )
                        }
                      </div>

                      <div className="text-xs text-blue-200/60">
                        Tool execution
                      </div>
                    </div>
                  </div>
                  {expandedItems.has(`${message.id}-${idx}`) ? (
                    <ChevronDown className="w-4 h-4 text-blue-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-blue-400" />
                  )}
                </button>

                {expandedItems.has(`${message.id}-${idx}`) && (
                  <div className="px-4 pb-4 border-t border-blue-700/20">
                    <div className="text-xs text-blue-200/60 mb-2">Arguments:</div>
                    <pre className="text-xs text-blue-100 bg-blue-950/30 p-2 rounded overflow-auto">
                      {JSON.stringify(toolCall.args, null, 2)}
                    </pre>
                    <div className="text-xs text-blue-200/60 mb-2">
                      {
                        (toolCall as any).content ? 'Result:' : 'Running...:'
                      }
                    </div>
                    <pre className="text-xs text-green-100 bg-green-950/30 p-2 rounded overflow-auto">
                      {JSON.stringify((toolCall as any).content, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))
          }
        </>
      );
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
                <pre className="text-xs text-green-100 bg-green-950/30 p-2 rounded overflow-auto max-h-40">
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
        <AiMessageBubble message={message} />
      );
    }

  }, [JSON.stringify(message), expandedItems]);


  return (
    <div className="space-y-2 mb-4 w-full">
      {renderMessage}

      {/* {isLoading && (
        <div className="flex items-center gap-2 text-xs text-neutral-500 justify-center py-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Processing...
        </div>
      )} */}
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

  const handleCopy = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };
  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 overflow-y-auto" ref={scrollAreaRef}>
        <div className="p-4 md:p-6 space-y-2 max-w-4xl mx-auto pt-16">
          {messages.map((message, index) => {
            return (
              <div key={message.id || `msg-${index}`} className="space-y-3">
                <div
                  className={`flex items-start gap-3 ${message.type === "human" ? "justify-end" : ""
                    }`}
                >
                  {message.type === "human" ? (
                    <HumanMessageBubble
                      message={message}
                      mdComponents={mdComponents}
                    />
                  ) : (
                    <div className="w-full max-w-[85%] md:max-w-[80%]">
                      <AIMessageRenderer
                        message={message}
                      />
                    </div>
                  )}
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
    </div>
  );
}
