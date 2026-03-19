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

  it("shows ? for tool calls with missing name", () => {
    const nodeData = {
      messages: [{ type: "ai", content: "", tool_calls: [{}] }],
    };
    const result = summariseLangGraphNode("agent", nodeData);
    expect(result).toBe("[agent] Calling: ?");
  });

  it("handles AI message with array content blocks", () => {
    const nodeData = {
      messages: [
        { type: "ai", content: [{ type: "text", text: "block1" }, "plain"] },
      ],
    };
    const result = summariseLangGraphNode("agent", nodeData);
    expect(result).toContain("block1");
    expect(result).toContain("plain");
  });

  it("skips non-ai non-tool messages and falls through", () => {
    const nodeData = {
      messages: [{ type: "human", content: "User said something" }],
    };
    const result = summariseLangGraphNode("node", nodeData);
    expect(result).toBe("Running: node");
  });

  it("returns null for AI message with empty content and no tool calls", () => {
    const nodeData = {
      messages: [{ type: "ai", content: "   " }],
    };
    const result = summariseLangGraphNode("agent", nodeData);
    expect(result).toBe("Running: agent");
  });

  it("handles tool message with no name", () => {
    const nodeData = {
      messages: [{ type: "tool", content: "Result data" }],
    };
    const result = summariseLangGraphNode("tools", nodeData);
    expect(result).toBe("[tool] Result data");
  });

  it("skips tool message with empty content", () => {
    const nodeData = {
      messages: [{ type: "tool", name: "search", content: "" }],
    };
    const result = summariseLangGraphNode("tools", nodeData);
    expect(result).toBe("Running: tools");
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

  it("skips null node data entries", () => {
    const raw = 'event: updates\ndata: {"node_a":null,"node_b":{"messages":[{"type":"ai","content":"Hi"}]}}';
    const result = adapter.normalizeChunk(raw);
    expect(result).not.toBeNull();
    const chunk = Array.isArray(result) ? result[0] : result;
    expect(chunk!.type).toBe("deep_research_status");
  });

  it("returns array when multiple nodes produce chunks", () => {
    const payload = {
      agent: { messages: [{ type: "ai", content: "Analyzing..." }] },
      tools: { messages: [{ type: "tool", name: "search", content: "Found results" }] },
    };
    const raw = `event: updates\ndata: ${JSON.stringify(payload)}`;
    const result = adapter.normalizeChunk(raw);
    expect(Array.isArray(result)).toBe(true);
    expect((result as unknown[]).length).toBe(2);
  });

  it("returns null when updates payload has no extractable nodes", () => {
    const raw = 'event: updates\ndata: {"__start__":{}}';
    const result = adapter.normalizeChunk(raw);
    expect(result).toBeNull();
  });

  it("extracts final answer from long AI message without tool calls", () => {
    const longContent = "A".repeat(250);
    const payload = {
      agent: {
        messages: [{ type: "ai", content: longContent }],
      },
    };
    const raw = `event: updates\ndata: ${JSON.stringify(payload)}`;
    const result = adapter.normalizeChunk(raw);
    expect(result).not.toBeNull();
    const chunk = Array.isArray(result) ? result[0] : result;
    expect(chunk!.type).toBe("deep_research_status");
    if (chunk!.type === "deep_research_status") {
      expect(chunk!.content.event_type).toBe("final_answer");
    }
  });

  it("does not extract final answer from short AI message", () => {
    const payload = {
      agent: {
        messages: [{ type: "ai", content: "Short reply" }],
      },
    };
    const raw = `event: updates\ndata: ${JSON.stringify(payload)}`;
    const result = adapter.normalizeChunk(raw);
    expect(result).not.toBeNull();
    const chunk = Array.isArray(result) ? result[0] : result;
    if (chunk!.type === "deep_research_status") {
      expect(chunk!.content.event_type).not.toBe("final_answer");
    }
  });

  it("does not extract final answer from AI message with tool calls", () => {
    const longContent = "A".repeat(250);
    const payload = {
      agent: {
        messages: [{ type: "ai", content: longContent, tool_calls: [{ name: "search" }] }],
      },
    };
    const raw = `event: updates\ndata: ${JSON.stringify(payload)}`;
    const result = adapter.normalizeChunk(raw);
    const chunk = Array.isArray(result) ? result[0] : result;
    if (chunk!.type === "deep_research_status") {
      expect(chunk!.content.event_type).toBe("activity");
    }
  });

  it("coerces array report to string", () => {
    const payload = {
      reporter: {
        final_report: [{ type: "text", text: "Part 1" }, "Part 2"],
      },
    };
    const raw = `event: updates\ndata: ${JSON.stringify(payload)}`;
    const result = adapter.normalizeChunk(raw);
    expect(result).not.toBeNull();
    const chunk = Array.isArray(result) ? result[0] : result;
    expect(chunk!.type).toBe("deep_research_status");
    if (chunk!.type === "deep_research_status") {
      expect(chunk!.content.event_type).toBe("final_answer");
      expect(chunk!.content.message).toContain("Part 1");
    }
  });

  it("handles error event with error field instead of message", () => {
    const raw = 'event: error\ndata: {"error":"Internal server error"}';
    const result = adapter.normalizeChunk(raw);
    expect(result).toMatchObject({
      type: "error",
      content: { message: "Internal server error" },
    });
  });

  it("handles error event with no data", () => {
    const raw = "event: error";
    const result = adapter.normalizeChunk(raw);
    expect(result).toMatchObject({
      type: "error",
      content: { message: "LangGraph run failed" },
    });
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

  it("uses graph_id when assistant has no name", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "0.1.0" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { assistant_id: "a1", name: null, graph_id: "my_graph" },
        ]),
        { status: 200 },
      ),
    );
    vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await detect("http://localhost:2024");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("my_graph");
  });

  it("throws when assistants search returns non-200", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ version: "0.1.0" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response("Unauthorized", { status: 401 }),
    );

    await expect(detect("http://localhost:2024")).rejects.toThrow(
      "assistants search failed: 401",
    );
  });
});

describe("LangGraphAdapter.startResearch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates thread and returns stream reader", async () => {
    const adapter = new LangGraphAdapter("http://localhost:2024", "test", {
      assistantId: "a1",
      streamMode: ["updates"],
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ thread_id: "t-123" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response("stream", { status: 200 }));

    const handle = await adapter.startResearch({
      message: "test query", threadId: "t1", sessionId: "s1", userId: "u1",
    });
    expect(handle.reader).toBeDefined();
    expect(handle.streamId).toBe("t-123");
  });

  it("throws on thread creation failure", async () => {
    const adapter = new LangGraphAdapter("http://localhost:2024", "test", {
      assistantId: "a1",
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response("Service unavailable", { status: 503 }),
    );

    await expect(
      adapter.startResearch({ message: "test", threadId: "t1", sessionId: "s1", userId: "u1" }),
    ).rejects.toThrow("thread creation failed: 503");
  });

  it("throws on stream failure", async () => {
    const adapter = new LangGraphAdapter("http://localhost:2024", "test", {
      assistantId: "a1",
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ thread_id: "t-1" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response("Internal error", { status: 500 }),
    );

    await expect(
      adapter.startResearch({ message: "test", threadId: "t1", sessionId: "s1", userId: "u1" }),
    ).rejects.toThrow("run stream failed: 500");
  });

  it("passes signal when provided", async () => {
    const adapter = new LangGraphAdapter("http://localhost:2024", "test", {
      assistantId: "a1",
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    const controller = new AbortController();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ thread_id: "t-1" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response("stream", { status: 200 }));

    await adapter.startResearch({
      message: "test", threadId: "t1", sessionId: "s1", userId: "u1",
      signal: controller.signal,
    });

    const firstCallInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(firstCallInit.signal).toBeDefined();
  });
});

describe("LangGraphAdapter.cancelResearch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns immediately for empty threadId", async () => {
    const adapter = new LangGraphAdapter("http://localhost:2024", "test", {
      assistantId: "a1",
    });
    const fetchMock = vi.mocked(globalThis.fetch);

    await adapter.cancelResearch("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends cancel request with token", async () => {
    const adapter = new LangGraphAdapter("http://localhost:2024", "test", {
      assistantId: "a1",
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));

    await adapter.cancelResearch("t-123", "my-token");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:2024/threads/t-123/runs/cancel",
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Token": "my-token" }),
      }),
    );
  });

  it("catches and warns on cancel failure", async () => {
    const adapter = new LangGraphAdapter("http://localhost:2024", "test", {
      assistantId: "a1",
    });
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error("Network fail"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await adapter.cancelResearch("t-123");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("cancel failed"),
      expect.any(Error),
    );
  });
});
