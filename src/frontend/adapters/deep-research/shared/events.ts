import type { DeepResearchEvent } from "../../../types/chat";
import type { NormalizedChunk } from "../types";

export function stringifyVar(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

export function extractTextFromBlock(block: unknown): string {
  if (typeof block === "string") return block;
  if (typeof block === "object" && block !== null && (block as Record<string, unknown>).type === "text") {
    return ((block as Record<string, unknown>).text as string) ?? "";
  }
  return "";
}

export function makeDRChunk(
  stage: string,
  eventType: string,
  message: string,
  logEntry?: string,
): Extract<NormalizedChunk, { type: "deep_research_status" }> {
  const drEvent: DeepResearchEvent = {
    stage,
    event_type: eventType,
    message,
    display_text: message,
    log_entry: logEntry ?? eventType,
    ui_visible: true,
    details: eventType === "final_answer" ? { report: message } : {},
    timestamp: new Date().toISOString(),
  };
  return { type: "deep_research_status", content: drEvent };
}

export function buildDefaultEvent(
  eventType: string,
  data: Record<string, unknown>,
  timestamp: string,
): Extract<NormalizedChunk, { type: "deep_research_status" }> {
  const message = (data.message as string) ?? (data.activity as string) ?? eventType;
  const drEvent: DeepResearchEvent = {
    stage: "research",
    event_type: eventType,
    message,
    display_text: message,
    log_entry: eventType,
    ui_visible: true,
    details: data,
    timestamp,
  };
  return { type: "deep_research_status", content: drEvent };
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function makeErrorChunk(message: string): Extract<NormalizedChunk, { type: "error" }> {
  return { type: "error", content: { message } };
}
