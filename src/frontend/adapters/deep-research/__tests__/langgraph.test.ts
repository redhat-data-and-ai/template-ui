import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LangGraphAdapter, summariseLangGraphNode, detect } from "../protocols/langgraph";

describe("summariseLangGraphNode", () => {
  it("returns null for __start__ node", () => {
    expect(summariseLangGraphNode("__start__", {})).toBeNull();
  });

  it("returns null for __end__ node", () => {
    expect(summariseLangGraphNode("__end__", {})).toBeNull();
  });

  it("summarises AI message with tool calls", () => {
    const nodeData = {
      messages: [
        { type: "ai", content: "", tool_calls: [{ name: "web_search" }] },
      ],
    };
    const result = summariseLangGraphNode("agent", nodeData);
    expect(result).toBe("[agent] Calling: web_search");
  });

  it("summarises AI message with text content", () => {
    const nodeData = {
      messages: [
        { type: "ai", content: "Analyzing the query..." },
      ],
    };
    const result = summariseLangGraphNode("agent", nodeData);
    expect(result).toBe("[agent] Analyzing the query...");
  });

  it("truncates long AI messages", () => {
    const longText = "A".repeat(300);
    const nodeData = {
      messages: [{ type: "ai", content: longText }],
    };
    const result = summariseLangGraphNode("agent", nodeData);
    expect(result).toContain("...");
    expect(result!.length).toBeLessThan(300);
  });

  it("summarises tool messages", () => {
    const nodeData = {
      messages: [
        { type: "tool", name: "search_tool", content: "Found 5 results" },
      ],
    };
    const result = summariseLangGraphNode("tools", nodeData);
    expect(result).toBe("[search_tool] Found 5 results");
  });

  it("summarises research brief node", () => {
    const nodeData = {
      research_brief: "Study the impact of AI on healthcare",
    };
    const result = summariseLangGraphNode("write_research_brief", nodeData);
    expect(result).toContain("Research brief:");
    expect(result).toContain("Study the impact");
  });

  it("returns running message for unknown nodes", () => {
    const result = summariseLangGraphNode("custom_node", {});
    expect(result).toBe("Running: custom_node");
  });

  it("uses supervisor_messages as fallback", () => {
    const nodeData = {
      supervisor_messages: [
        { type: "ai", content: "Delegating to researcher" },
      ],
    };
    const result = summariseLangGraphNode("supervisor", nodeData);
    expect(result).toBe("[supervisor] Delegating to researcher");
  });
});

describe("LangGraphAdapter.normalizeChunk", () => {
  const adapter = new LangGraphAdapter("http://localhost:2024", "test", {
    assistantId: "test-assistant",
    streamMode: ["updates"],
    reportStateField: "final_report",
  });

  it("returns null for empty input", () => {
    expect(adapter.normalizeChunk("")).toBeNull();
    expect(adapter.normalizeChunk("   ")).toBeNull();
  });

  it("handles metadata event", () => {
    const raw = "event: metadata\ndata: {\"run_id\":\"abc\"}";
    const result = adapter.normalizeChunk(raw);
    expect(result).not.toBeNull();
    expect(Array.isArray(result) ? result[0] : result).toMatchObject({
      type: "deep_research_status",
      content: { event_type: "started" },
    });
  });

  it("handles error event with JSON payload", () => {
    const raw = 'event: error\ndata: {"message":"Run failed"}';
    const result = adapter.normalizeChunk(raw);
    expect(result).toMatchObject({
      type: "error",
      content: { message: "Run failed" },
    });
  });

  it("handles error event with plain text", () => {
    const raw = "event: error\ndata: Something broke";
    const result = adapter.normalizeChunk(raw);
    expect(result).toMatchObject({
      type: "error",
      content: { message: "Something broke" },
    });
  });

  it("ignores non-updates events", () => {
    const raw = "event: heartbeat\ndata: {}";
    expect(adapter.normalizeChunk(raw)).toBeNull();
  });

  it("parses updates with activity", () => {
    const raw = 'event: updates\ndata: {"agent":{"messages":[{"type":"ai","content":"Thinking..."}]}}';
    const result = adapter.normalizeChunk(raw);
    expect(result).not.toBeNull();
    const chunk = Array.isArray(result) ? result[0] : result;
    expect(chunk!.type).toBe("deep_research_status");
  });

  it("extracts final report from state", () => {
    const raw = 'event: updates\ndata: {"reporter":{"final_report":"# Final Report\\nThis is the report."}}';
    const result = adapter.normalizeChunk(raw);
    expect(result).not.toBeNull();
    const chunk = Array.isArray(result) ? result[0] : result;
    expect(chunk!.type).toBe("deep_research_status");
    if (chunk!.type === "deep_research_status") {
      expect(chunk!.content.event_type).toBe("final_answer");
    }
  });

  it("handles malformed JSON in updates data", () => {
    const raw = "event: updates\ndata: {invalid json}";
    expect(adapter.normalizeChunk(raw)).toBeNull();
  });
});

describe("detect", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns null when /info returns non-200", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response("Not found", { status: 404 }),
    );
    const result = await detect("http://localhost:2024");
    expect(result).toBeNull();
  });

  it("returns null when /info has no version field", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const result = await detect("http://localhost:2024");
    expect(result).toBeNull();
  });

  it("returns adapter when server responds correctly", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "0.1.0" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { assistant_id: "a1", name: "research", graph_id: "research_graph" },
        ]),
        { status: 200 },
      ),
    );

    const result = await detect("http://localhost:2024");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("research");
  });

  it("throws when server detected but no assistants found", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "0.1.0" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await expect(detect("http://localhost:2024")).rejects.toThrow(
      "no assistants found",
    );
  });

  it("returns null on network error", async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await detect("http://localhost:2024");
    expect(result).toBeNull();
  });
});
