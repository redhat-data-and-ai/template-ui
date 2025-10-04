import { useState } from "react";
import { StreamEvent, ToolCall } from "../hooks/useDataStream";
import {
  Brain,
  Settings,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Play,
  Zap,
} from "lucide-react";

interface StreamEventRendererProps {
  events: StreamEvent[];
  isLoading: boolean;
}

interface ProcessedEvent {
  id: string;
  type: string;
  timestamp: string;
  content?: string;
  chunk_id?: number;
  tool_calls?: ToolCall[];
}

export function StreamEventRenderer({ events, isLoading }: StreamEventRendererProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const processedEvents: ProcessedEvent[] = [];
  let currentTokenGroup: string[] = [];
  let currentTokenStartId: string | null = null;

  events.forEach((event, index) => {
    if (event.type === 'token') {
      // Group consecutive tokens together
      if (!currentTokenStartId) {
        currentTokenStartId = `token-group-${index}`;
        currentTokenGroup = [];
      }
      currentTokenGroup.push(typeof event.content === "string" ? event.content : JSON.stringify(event.content));
    } else {
      // If we have accumulated tokens, add them as a group
      if (currentTokenGroup.length > 0 && currentTokenStartId) {
        processedEvents.push({
          id: currentTokenStartId,
          type: 'token_group',
          timestamp: event.timestamp,
          content: currentTokenGroup.join(''),
        });
        currentTokenGroup = [];
        currentTokenStartId = null;
      }

      // Add the non-token event
      processedEvents.push({
        id: `${event.type}-${index}`,
        type: event.type,
        timestamp: event.timestamp,
        content: typeof event.content === "string" ? event.content : JSON.stringify(event.content),
        chunk_id: event.chunk_id,
        tool_calls: event.tool_calls,
      });
    }
  });

  if (currentTokenGroup.length > 0 && currentTokenStartId) {
    processedEvents.push({
      id: currentTokenStartId,
      type: 'token_group',
      timestamp: new Date().toISOString(),
      content: currentTokenGroup.join(''),
    });
  }

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

  const renderEvent = (event: ProcessedEvent) => {
    switch (event.type) {
      case 'thinking':
        return (
          <div key={event.id} className="bg-purple-900/20 border border-purple-700/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Brain className="w-5 h-5 text-purple-400 mt-0.5" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-purple-100">AI Thinking</span>
                  {isLoading && <Loader2 className="w-3 h-3 text-purple-400 animate-spin" />}
                </div>
                <p className="text-sm text-purple-200/80 italic">
                  <div dangerouslySetInnerHTML={{
                    __html: typeof event.content === "string"
                      ? event.content
                      : JSON.stringify(event.content)
                  }} />
                </p>
              </div>
            </div>
          </div>
        );

      case 'tool_call':
        const isExpanded = expandedItems.has(event.id);
        return (
          event.tool_calls?.map((toolCall: ToolCall) => (
            <div key={event.id} className="bg-blue-900/20 border border-blue-700/30 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleExpand(event.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-blue-800/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Settings className="w-5 h-5 text-blue-400" />
                <div className="text-left">
                  <div className="text-sm font-medium text-blue-100">
                    {toolCall.name}
                  </div>
                  <div className="text-xs text-blue-200/60">
                    Tool execution
                  </div>
                </div>
              </div>
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-blue-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-blue-400" />
              )}
            </button>

            {isExpanded && (
              <div className="px-4 pb-4 border-t border-blue-700/20">
                <div className="text-xs text-blue-200/60 mb-2">Arguments:</div>
                <pre className="text-xs text-blue-100 bg-blue-950/30 p-2 rounded overflow-auto">
                  {JSON.stringify(toolCall.args, null, 2)}
                </pre>
              </div>
            )}
          </div>
          ))
        );

      case 'tool_result':
        const resultExpanded = expandedItems.has(event.id);
        return (
          <div key={event.id} className="bg-green-900/20 border border-green-700/30 rounded-lg overflow-hidden ml-6">
            <button
              onClick={() => toggleExpand(event.id)}
              className="w-full flex items-center justify-between p-3 hover:bg-green-800/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <div className="text-left">
                  <div className="text-sm font-medium text-green-100">
                    {event.tool_calls?.[0].name} result
                  </div>
                  <div className="text-xs text-green-200/60">
                    Execution completed
                  </div>
                </div>
              </div>
              {resultExpanded ? (
                <ChevronDown className="w-4 h-4 text-green-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-green-400" />
              )}
            </button>

            {resultExpanded && (
              <div className="px-3 pb-3 border-t border-green-700/20">
                <div className="text-xs text-green-200/60 mb-2">Result:</div>
                <pre className="text-xs text-green-100 bg-green-950/30 p-2 rounded overflow-auto max-h-40">
                  {typeof event.content === 'string' ? event.content : JSON.stringify(event.content, null, 2)}
                </pre>
              </div>
            )}
          </div>
        );

      case 'token_group':
        return (
          <div key={event.id} className="bg-neutral-800/30 border border-neutral-700/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Zap className="w-4 h-4 text-orange-400 mt-0.5" />
              <div className="flex-1">
                <div className="text-sm font-medium text-orange-100 mb-2">
                  AI Response
                </div>
                <div className="text-sm text-neutral-200 prose prose-sm prose-invert max-w-none">
                <div dangerouslySetInnerHTML={{
                    __html: typeof event.content === "string"
                      ? event.content
                      : JSON.stringify(event.content)
                  }} />
                  {isLoading && <span className="animate-pulse">|</span>}
                </div>
              </div>
            </div>
          </div>
        );

      case 'step_complete':
        return (
          <div key={event.id} className="flex items-center justify-center py-2">
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <CheckCircle className="w-3 h-3" />
              Step {event.tool_calls?.[0].name} completed
            </div>
          </div>
        );

      case 'start':
        return (
          <div key={event.id} className="flex items-center gap-2 text-xs text-neutral-500 mb-2">
            <Play className="w-3 h-3" />
            Session started
          </div>
        );

      case 'complete':
        return (
          <div key={event.id} className="flex items-center justify-center py-4">
            <div className="flex items-center gap-2 text-sm text-green-400 bg-green-900/20 px-3 py-1 rounded-full border border-green-700/30">
              <CheckCircle className="w-4 h-4" />
              Task completed
            </div>
          </div>
        );

      case 'error':
        return (
          <div key={event.id} className="bg-red-900/20 border border-red-700/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="w-5 h-5 text-red-400 mt-0.5">⚠️</div>
              <div className="flex-1">
                <div className="text-sm font-medium text-red-100 mb-1">Error</div>
                <p className="text-sm text-red-200/80">
                  {event.content}
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div key={event.id} className="bg-neutral-800/30 border border-neutral-600/30 rounded-lg p-3">
            <div className="text-xs text-neutral-400 mb-1">
              {event.type}
            </div>
            <div className="text-sm text-neutral-300">
              {event.content || 'No content'}
            </div>
          </div>
        );
    }
  };

  if (events.length === 0 && !isLoading) return null;

  return (
    <div className="space-y-2 mb-4">
      {processedEvents.map(renderEvent)}

      {isLoading && (
        <div className="flex items-center gap-2 text-xs text-neutral-500 justify-center py-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Processing...
        </div>
      )}
    </div>
  );
}