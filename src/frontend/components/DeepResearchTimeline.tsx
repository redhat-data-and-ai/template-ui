import React, { useEffect, useRef, useState } from "react";
import {
  Search,
  FileText,
  CheckCircle,
  AlertCircle,
  Clock,
  Loader2,
  Zap,
  Network,
  ShieldCheck,
  RefreshCw,
  ArrowRightLeft,
  Microscope,
  MessageSquare,
  Beaker,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { humanize } from "../lib/utils";
import type { DeepResearchEvent } from "../types/chat";

interface DeepResearchTimelineProps {
  readonly events: DeepResearchEvent[];
  readonly isLoading: boolean;
}

function resolveStatus(event: DeepResearchEvent, isLast: boolean, isLoading: boolean): string {
  const et = event.event_type?.toLowerCase() ?? "";
  if (et.includes("error")) return "error";
  if (et.includes("complete") || et.includes("final")) return "completed";
  if (isLast && isLoading) return "running";
  return "completed";
}

function statusColor(status: string): string {
  if (status === "running") return "text-blue-400";
  if (status === "completed") return "text-green-400";
  if (status === "error") return "text-red-400";
  return "text-neutral-500";
}

const StageIcon: React.FC<{ stage: string; status: string }> = ({ stage, status }) => {
  const iconClass = `w-4 h-4 ${statusColor(status)}`;

  if (status === "running") {
    return <Loader2 className={`${iconClass} animate-spin`} />;
  }

  const s = stage.toLowerCase();

  if (s.includes("triage") || s.includes("context_answer")) return <Zap className={iconClass} />;
  if (s.includes("discovery") || s.includes("probe")) return <Search className={iconClass} />;
  if (s.includes("enrichment")) return <FileText className={iconClass} />;
  if (s === "worker_progress") return <Beaker className={iconClass} />;
  if (s.includes("plan") || s.includes("understanding") || s.includes("subquery_validation")) return <FileText className={iconClass} />;
  if (s.includes("supervisor")) return <Network className={iconClass} />;
  if (s.includes("worker_self") || s.includes("worker_reform")) return <RefreshCw className={iconClass} />;
  if (s.includes("completeness")) return <ShieldCheck className={iconClass} />;
  if (s.includes("inter_agent")) return <ArrowRightLeft className={iconClass} />;
  if (s.includes("research") || s.includes("subquery")) return <Beaker className={iconClass} />;
  if (s.includes("synthesis") || s.includes("review")) return <MessageSquare className={iconClass} />;
  if (s.includes("complete") || s.includes("final")) return <CheckCircle className={iconClass} />;
  if (s.includes("error")) return <AlertCircle className={iconClass} />;

  return <Clock className={iconClass} />;
};

interface TimelineItemProps {
  readonly event: DeepResearchEvent;
  readonly status: string;
  readonly isLast: boolean;
}

const TimelineItem: React.FC<TimelineItemProps> = ({ event, status, isLast }) => {
  const getStatusColor = () => {
    switch (status) {
      case "running": return "border-blue-500 bg-blue-900/30";
      case "completed": return "border-green-500 bg-green-900/20";
      case "error": return "border-red-500 bg-red-900/20";
      default: return "border-neutral-600 bg-neutral-800/30";
    }
  };

  const getLineColor = () => {
    switch (status) {
      case "completed": return "bg-green-500";
      case "error": return "bg-red-500";
      case "running": return "bg-blue-500";
      default: return "bg-neutral-600";
    }
  };

  const stageKey = event.event_type || event.stage || "";

  return (
    <li className="relative flex gap-3 list-none">
      {!isLast && (
        <div className={`absolute left-[9px] top-6 w-0.5 h-full ${getLineColor()}`} />
      )}
      <div className={`relative z-10 flex items-center justify-center w-5 h-5 rounded-full border ${getStatusColor()}`}>
        <StageIcon stage={stageKey} status={status} />
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-neutral-200">
            {humanize(stageKey)}
          </span>
          {event.timestamp && (
            <span className="text-[10px] text-neutral-500">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
        <p className="text-xs text-neutral-400 mt-0.5">
          {event.display_text || event.message || ""}
        </p>
      </div>
    </li>
  );
};

function computeElapsedTime(events: DeepResearchEvent[]): string | null {
  if (events.length < 2) return null;
  const first = events[0]?.timestamp;
  const last = events.at(-1)?.timestamp;
  if (!first || !last) return null;
  const ms = new Date(last).getTime() - new Date(first).getTime();
  if (ms <= 0) return null;
  const secs = Math.round(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  return rem > 0 ? `${mins}m ${rem}s` : `${mins}m`;
}

export function DeepResearchTimeline({ events, isLoading }: Readonly<DeepResearchTimelineProps>) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const visibleEvents = events.filter(e => e.ui_visible);

  const isCompleted = visibleEvents.some(e => {
    const et = e.event_type?.toLowerCase() ?? "";
    return et === "completed" || et === "final_answer";
  });

  const hasError = visibleEvents.length > 0 &&
    (visibleEvents.at(-1)?.event_type?.toLowerCase() ?? "").includes("error");

  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    if (isCompleted || hasError) {
      setIsExpanded(false);
    }
  }, [isCompleted, hasError]);

  useEffect(() => {
    if (isExpanded) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [visibleEvents.length, isExpanded]);

  if (events.length === 0) return null;

  const elapsed = computeElapsedTime(visibleEvents);

  return (
    <div className="rounded-lg text-sm overflow-hidden border border-neutral-600/40 bg-neutral-800/30 mb-4">
      <button
        type="button"
        onClick={() => setIsExpanded(prev => !prev)}
        aria-expanded={isExpanded}
        aria-label={`Deep Research timeline, ${visibleEvents.length} events`}
        className="w-full px-4 py-3 flex items-center gap-2 hover:bg-neutral-700/30 transition-colors cursor-pointer"
      >
        <Microscope className="w-4 h-4 text-purple-400 shrink-0" />
        <span className="text-xs font-medium text-purple-300">Deep Research</span>
        <span className="text-xs text-neutral-500">{visibleEvents.length} events</span>
        {elapsed && (isCompleted || hasError) && (
          <span className="text-[10px] text-neutral-500 ml-1">({elapsed})</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          {isLoading && !isCompleted && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-400" />
          )}
          {isCompleted && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
          {hasError && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-neutral-400" />
          ) : (
            <ChevronRight className="w-4 h-4 text-neutral-400" />
          )}
        </span>
      </button>

      {isExpanded && (
        <div className="px-4 pb-3">
          {/* Timeline Events */}
          <ul className="max-h-[350px] overflow-y-auto list-none p-0 m-0" aria-label="Research events">
            {visibleEvents.map((event, idx) => {
              const status = resolveStatus(event, idx === visibleEvents.length - 1, isLoading);
              return (
                <TimelineItem
                  key={`${event.event_type}-${idx}`}
                  event={event}
                  status={status}
                  isLast={idx === visibleEvents.length - 1}
                />
              );
            })}
            <li className="list-none" aria-hidden="true"><div ref={bottomRef} /></li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default DeepResearchTimeline;
