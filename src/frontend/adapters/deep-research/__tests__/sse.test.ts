import { describe, it, expect } from "vitest";
import { parseSSEChunk } from "../shared/sse";

describe("parseSSEChunk", () => {
  it("parses a standard SSE chunk with event and data", () => {
    const raw = "event: updates\ndata: {\"key\":\"value\"}";
    const result = parseSSEChunk(raw);
    expect(result.eventType).toBe("updates");
    expect(result.dataStr).toBe('{"key":"value"}');
  });

  it("parses a chunk with only data lines", () => {
    const raw = "data: hello world";
    const result = parseSSEChunk(raw);
    expect(result.eventType).toBe("");
    expect(result.dataStr).toBe("hello world");
  });

  it("concatenates multiple data lines", () => {
    const raw = "data: line1\ndata: line2\ndata: line3";
    const result = parseSSEChunk(raw);
    expect(result.dataStr).toBe("line1\nline2\nline3");
  });

  it("handles raw JSON without SSE prefix", () => {
    const raw = '{"type":"token","content":"hello"}';
    const result = parseSSEChunk(raw);
    expect(result.dataStr).toBe('{"type":"token","content":"hello"}');
    expect(result.eventType).toBe("");
  });

  it("returns empty dataStr for empty input", () => {
    const result = parseSSEChunk("");
    expect(result.dataStr).toBe("");
    expect(result.eventType).toBe("");
  });

  it("handles CRLF line endings", () => {
    const raw = "event: metadata\r\ndata: {\"run_id\":\"abc\"}";
    const result = parseSSEChunk(raw);
    expect(result.eventType).toBe("metadata");
    expect(result.dataStr).toBe('{"run_id":"abc"}');
  });

  it("ignores non-event, non-data lines", () => {
    const raw = "id: 123\nevent: test\ndata: payload\nretry: 5000";
    const result = parseSSEChunk(raw);
    expect(result.eventType).toBe("test");
    expect(result.dataStr).toBe("payload");
  });
});
