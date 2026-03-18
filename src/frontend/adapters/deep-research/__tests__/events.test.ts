import { describe, it, expect } from "vitest";
import {
  stringifyVar,
  extractTextFromBlock,
  makeDRChunk,
  buildDefaultEvent,
  getNestedValue,
  makeErrorChunk,
} from "../shared/events";

describe("stringifyVar", () => {
  it("returns empty string for null", () => {
    expect(stringifyVar(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(stringifyVar(undefined)).toBe("");
  });

  it("returns string as-is", () => {
    expect(stringifyVar("hello")).toBe("hello");
  });

  it("converts number to string", () => {
    expect(stringifyVar(42)).toBe("42");
  });

  it("converts boolean to string", () => {
    expect(stringifyVar(true)).toBe("true");
    expect(stringifyVar(false)).toBe("false");
  });

  it("JSON-stringifies objects", () => {
    expect(stringifyVar({ a: 1 })).toBe('{"a":1}');
  });

  it("JSON-stringifies arrays", () => {
    expect(stringifyVar([1, 2])).toBe("[1,2]");
  });
});

describe("extractTextFromBlock", () => {
  it("returns string directly", () => {
    expect(extractTextFromBlock("hello")).toBe("hello");
  });

  it("extracts text from a text-type block", () => {
    expect(extractTextFromBlock({ type: "text", text: "content" })).toBe("content");
  });

  it("returns empty string for non-text block", () => {
    expect(extractTextFromBlock({ type: "image", url: "..." })).toBe("");
  });

  it("returns empty string for null", () => {
    expect(extractTextFromBlock(null)).toBe("");
  });

  it("returns empty string for number", () => {
    expect(extractTextFromBlock(42)).toBe("");
  });
});

describe("makeDRChunk", () => {
  it("creates a deep_research_status chunk", () => {
    const chunk = makeDRChunk("research", "activity", "Searching...");
    expect(chunk.type).toBe("deep_research_status");
    expect(chunk.content.stage).toBe("research");
    expect(chunk.content.event_type).toBe("activity");
    expect(chunk.content.message).toBe("Searching...");
    expect(chunk.content.display_text).toBe("Searching...");
    expect(chunk.content.ui_visible).toBe(true);
    expect(chunk.content.timestamp).toBeDefined();
  });

  it("uses custom logEntry when provided", () => {
    const chunk = makeDRChunk("triage", "started", "Starting", "custom_log");
    expect(chunk.content.log_entry).toBe("custom_log");
  });

  it("defaults logEntry to eventType", () => {
    const chunk = makeDRChunk("triage", "started", "Starting");
    expect(chunk.content.log_entry).toBe("started");
  });

  it("includes report in details for final_answer", () => {
    const chunk = makeDRChunk("complete", "final_answer", "Report text");
    expect(chunk.content.details.report).toBe("Report text");
  });
});

describe("buildDefaultEvent", () => {
  it("creates a default event with message from data", () => {
    const chunk = buildDefaultEvent("search", { message: "Found 5 results" }, "2025-01-01T00:00:00Z");
    expect(chunk.type).toBe("deep_research_status");
    expect(chunk.content.message).toBe("Found 5 results");
    expect(chunk.content.timestamp).toBe("2025-01-01T00:00:00Z");
    expect(chunk.content.stage).toBe("research");
  });

  it("falls back to eventType when no message field", () => {
    const chunk = buildDefaultEvent("custom_event", {}, "2025-01-01T00:00:00Z");
    expect(chunk.content.message).toBe("custom_event");
  });

  it("uses activity field as fallback", () => {
    const chunk = buildDefaultEvent("step", { activity: "Processing" }, "2025-01-01T00:00:00Z");
    expect(chunk.content.message).toBe("Processing");
  });
});

describe("getNestedValue", () => {
  it("extracts top-level value", () => {
    expect(getNestedValue({ a: 1 }, "a")).toBe(1);
  });

  it("extracts nested value", () => {
    expect(getNestedValue({ a: { b: { c: "deep" } } }, "a.b.c")).toBe("deep");
  });

  it("returns undefined for missing path", () => {
    expect(getNestedValue({ a: 1 }, "b")).toBeUndefined();
  });

  it("returns undefined for path through null", () => {
    expect(getNestedValue({ a: null } as Record<string, unknown>, "a.b")).toBeUndefined();
  });

  it("returns undefined for path through primitive", () => {
    expect(getNestedValue({ a: "string" }, "a.b")).toBeUndefined();
  });
});

describe("makeErrorChunk", () => {
  it("creates an error chunk with the given message", () => {
    const chunk = makeErrorChunk("Something went wrong");
    expect(chunk.type).toBe("error");
    expect(chunk.content.message).toBe("Something went wrong");
  });

  it("handles empty message", () => {
    const chunk = makeErrorChunk("");
    expect(chunk.type).toBe("error");
    expect(chunk.content.message).toBe("");
  });
});
