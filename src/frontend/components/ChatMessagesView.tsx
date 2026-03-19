import React, { useState, useMemo } from "react";
import type { Message } from "@langchain/langgraph-sdk";
import { ScrollArea } from "./ui/scroll-area";
import { CheckCircle, ChevronDown, ChevronRight, Loader2, Send, Settings } from "lucide-react";
import { InputForm } from "./InputForm";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { DeepResearchEvent } from "../types/chat";
import type { PendingPlan } from "../hooks/useDataStream";
import type { AdapterFeatures } from "../adapters/deep-research";
import { DeepResearchTimeline } from "./DeepResearchTimeline";
import { PlanApprovalCard } from "./PlanApprovalCard";
import { mdComponents } from "./mdComponents";
import {
  ActivityTimeline,
  ProcessedEvent,
} from "./ActivityTimeline";

const HumanMessageBubble: React.FC<{ readonly message: Message }> = React.memo(({ message }) => (
  <div className="text-white rounded-3xl break-words min-h-7 bg-neutral-700 max-w-[100%] sm:max-w-[90%] p-3 rounded-br-xs">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
      {typeof message.content === "string" ? message.content : JSON.stringify(message.content)}
    </ReactMarkdown>
  </div>
));

const htmlSanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "div", "span", "section", "article", "header", "footer", "nav", "figure", "figcaption",
  ],
  attributes: {
    ...defaultSchema.attributes,
    div: [...(defaultSchema.attributes?.div ?? []), "className", "class"],
    span: [...(defaultSchema.attributes?.span ?? []), "className", "class"],
    img: [...(defaultSchema.attributes?.img ?? []), "src", "alt", "width", "height", "class"],
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "class"],
  },
};

const AiMessageBubble: React.FC<{ readonly message: Message }> = React.memo(({ message }) => {
  const content = typeof message.content === "string" ? message.content : JSON.stringify(message.content);
  const hasHtml = /<[a-z][\s\S]*>/i.test(content);

  return (
    <div className="relative break-words flex flex-col w-full">
      <div className="w-full prose prose-invert prose-sm md:prose-base max-w-none overflow-hidden [overflow-wrap:anywhere] prose-table:border-collapse prose-th:bg-neutral-800 prose-td:border prose-td:border-neutral-700 prose-td:px-3 prose-td:py-2 prose-th:border prose-th:border-neutral-700 prose-th:px-3 prose-th:py-2 prose-strong:text-neutral-100">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={hasHtml ? [rehypeRaw, [rehypeSanitize, htmlSanitizeSchema]] : []}
          components={mdComponents}
        >
          {content}
        </ReactMarkdown>
      </div>
    </div>
  );
});

interface ChatMessagesViewProps {
  messages: Message[];
  isLoading: boolean;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  onSubmit: (inputValue: string) => void;
  onCancel: () => void;
  liveActivityEvents: ProcessedEvent[];
  deepResearchEnabled: boolean;
  deepResearchLocked?: boolean;
  onToggleDeepResearch: () => void;
  deepResearchEvents?: DeepResearchEvent[];
  pendingPlan?: PendingPlan | null;
  onApprovePlan?: (subqueries: string[]) => void;
  onRejectPlan?: () => void;
  adapterFeatures?: AdapterFeatures;
  onSendSteering?: (message: string) => Promise<unknown>;
}

function SteeringInput({ onSend, disabled }: Readonly<{ onSend: (msg: string) => void; disabled: boolean }>) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 mt-2 px-2">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Steer the research (e.g., 'focus on solar energy')..."
        disabled={disabled}
        className="flex-1 bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        aria-label="Send steering message"
        className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <Send className="w-4 h-4" />
      </button>
    </form>
  );
}

export function AIMessageRenderer({ message }: { message: Message }) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpand = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) newSet.delete(itemId);
      else newSet.add(itemId);
      return newSet;
    });
  };

  const renderMessage = useMemo(() => {
    const hasToolCalls = message.type === 'ai' && Array.isArray(message?.tool_calls) && message.tool_calls.length > 0;
    const isToolResult = message.type === 'tool';
    const isNormalMessage = message.type === 'ai' && (!Array.isArray(message?.tool_calls) || message.tool_calls.length === 0);

    if (hasToolCalls) {
      return (
        <>
          {message.tool_calls?.map((toolCall, idx) => (
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
                      {(toolCall as Record<string, unknown>).content ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                      )}
                    </div>
                    <div className="text-xs text-blue-200/60">Tool execution</div>
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
                    {(toolCall as Record<string, unknown>).content ? 'Result:' : 'Running...:'}
                  </div>
                  <pre className="text-xs text-green-100 bg-green-950/30 p-2 rounded overflow-auto">
                    {JSON.stringify((toolCall as Record<string, unknown>).content, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </>
      );
    }

    if (isToolResult) {
      return (
        <div key={message.id} className="bg-green-900/20 border border-green-700/30 rounded-lg overflow-hidden ml-6 w-full">
          <button
            onClick={() => toggleExpand(message.id || '')}
            className="w-full flex items-center justify-between p-3 hover:bg-green-800/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <div className="text-left">
                <div className="text-sm font-medium text-green-100">{message.name} result</div>
                <div className="text-xs text-green-200/60">Execution completed</div>
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
      );
    }

    if (isNormalMessage) {
      return <AiMessageBubble message={message} />;
    }

    return null;
  }, [message, expandedItems]);

  return (
    <div className="space-y-2 mb-4 w-full">
      {renderMessage}
    </div>
  );
}

export function ChatMessagesView({
  messages,
  isLoading,
  scrollAreaRef,
  onSubmit,
  onCancel,
  liveActivityEvents = [],
  deepResearchEnabled,
  deepResearchLocked = false,
  onToggleDeepResearch,
  deepResearchEvents = [],
  pendingPlan,
  onApprovePlan,
  onRejectPlan,
  adapterFeatures,
  onSendSteering,
}: ChatMessagesViewProps) {
  const showPlanApproval = adapterFeatures?.planApproval !== false;
  const showSteering = adapterFeatures?.steering === true && !!onSendSteering;
  const { tagged, untagged } = useMemo(() => {
    const tagged = new Map<string, DeepResearchEvent[]>();
    const untagged: DeepResearchEvent[] = [];
    for (const event of deepResearchEvents) {
      if (event.triggerMessageId) {
        const list = tagged.get(event.triggerMessageId) ?? [];
        list.push(event);
        tagged.set(event.triggerMessageId, list);
      } else {
        untagged.push(event);
      }
    }
    return { tagged, untagged };
  }, [deepResearchEvents]);

  const lastHumanMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === "human") return messages[i].id;
    }
    return undefined;
  }, [messages]);

  return (
    <div className="flex flex-col h-full">
      <ScrollArea className="flex-1 overflow-y-auto" ref={scrollAreaRef}>
        <div className="p-4 md:p-6 lg:px-10 xl:px-16 space-y-2 w-full pt-16 overflow-hidden">
          {messages.map((message, index) => {
            const msgEvents = message.type === "human"
              ? tagged.get(message.id ?? "") ?? []
              : [];
            const isLatestHuman = message.id === lastHumanMsgId;
            const showUntagged = isLatestHuman && untagged.length > 0;
            const combinedEvents = showUntagged ? [...msgEvents, ...untagged] : msgEvents;
            const timelineLoading = isLatestHuman && isLoading;

            return (
              <React.Fragment key={message.id || `msg-${index}`}>
                <div className="space-y-3">
                  <div className={`flex items-start gap-3 ${message.type === "human" ? "justify-end" : ""}`}>
                    {message.type === "human" ? (
                      <HumanMessageBubble message={message} />
                    ) : (
                      <div className="w-full">
                        <AIMessageRenderer message={message} />
                      </div>
                    )}
                  </div>
                </div>

                {combinedEvents.length > 0 && (
                  <DeepResearchTimeline events={combinedEvents} isLoading={timelineLoading} />
                )}

                {isLatestHuman && showPlanApproval && pendingPlan && onApprovePlan && onRejectPlan && (
                  <PlanApprovalCard plan={pendingPlan} onApprove={onApprovePlan} onReject={onRejectPlan} />
                )}

                {isLatestHuman && showSteering && isLoading && (
                  <SteeringInput onSend={onSendSteering!} disabled={false} />
                )}
              </React.Fragment>
            );
          })}

          {messages.length === 0 && deepResearchEvents.length > 0 && (
            <DeepResearchTimeline events={deepResearchEvents} isLoading={isLoading} />
          )}

          {liveActivityEvents.length > 0 && (
            <ActivityTimeline processedEvents={liveActivityEvents} isLoading={isLoading} />
          )}
        </div>
        {isLoading && deepResearchEvents.length === 0 && liveActivityEvents.length === 0 && (
          <div role="status" aria-live="polite" aria-busy="true" className="flex items-center gap-2 text-xs text-neutral-500 justify-center py-2">
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
        deepResearchEnabled={deepResearchEnabled}
        deepResearchLocked={deepResearchLocked}
        onToggleDeepResearch={onToggleDeepResearch}
      />
    </div>
  );
}
