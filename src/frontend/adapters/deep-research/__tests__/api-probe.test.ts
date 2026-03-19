import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiProbeAdapter, isValidConfig, detect } from "../protocols/api-probe";
import type { AdapterConfigSchema } from "../config-types";
import type { NormalizedChunk } from "../types";

vi.mock("../../../config", () => ({
  getBackendUrl: vi.fn(() => "http://localhost:5002"),
  getAdapterConfig: vi.fn(() => null),
}));

import { getAdapterConfig } from "../../../config";

function makeConfig(overrides?: Partial<AdapterConfigSchema>): AdapterConfigSchema {
  return {
    name: "test-backend",
    features: { planApproval: false, steering: false, modelSelection: false },
    endpoints: {
      start: { path: "/api/research", method: "POST", bodyMapping: { query: "{{message}}" } },
      cancel: { path: "/api/cancel/{{threadId}}", method: "POST" },
    },
    stream: { mode: "direct", chunkFormat: "passthrough" },
    ...overrides,
  };
}

function unwrapSingle(result: NormalizedChunk | NormalizedChunk[] | null): NormalizedChunk | null {
  if (result == null) return null;
  return Array.isArray(result) ? result[0] ?? null : result;
}

describe("isValidConfig", () => {
  it("accepts a valid config", () => {
    expect(isValidConfig(makeConfig())).toBe(true);
  });

  it("rejects null", () => {
    expect(isValidConfig(null)).toBe(false);
  });

  it("rejects non-object", () => {
    expect(isValidConfig("string")).toBe(false);
  });

  it("rejects config without name", () => {
    const cfg = makeConfig();
    (cfg as unknown as Record<string, unknown>).name = 42;
    expect(isValidConfig(cfg)).toBe(false);
  });

  it("rejects config without features", () => {
    const cfg = makeConfig();
    delete (cfg as unknown as Record<string, unknown>).features;
    expect(isValidConfig(cfg)).toBe(false);
  });

  it("rejects config with non-object features", () => {
    const cfg = makeConfig();
    (cfg as unknown as Record<string, unknown>).features = "bad";
    expect(isValidConfig(cfg)).toBe(false);
  });

  it("rejects config with empty endpoints", () => {
    const cfg = makeConfig();
    (cfg as unknown as Record<string, unknown>).endpoints = {};
    expect(isValidConfig(cfg)).toBe(false);
  });

  it("rejects config without start endpoint path", () => {
    const cfg = makeConfig();
    (cfg.endpoints.start as unknown as Record<string, unknown>).path = undefined;
    expect(isValidConfig(cfg)).toBe(false);
  });

  it("rejects config without start endpoint method", () => {
    const cfg = makeConfig();
    delete (cfg.endpoints.start as unknown as Record<string, unknown>).method;
    expect(isValidConfig(cfg)).toBe(false);
  });

  it("rejects config with invalid endpoint method", () => {
    const cfg = makeConfig();
    (cfg.endpoints.start as unknown as Record<string, unknown>).method = "PATCH";
    expect(isValidConfig(cfg)).toBe(false);
  });

  it("rejects config without cancel endpoint", () => {
    const cfg = makeConfig();
    delete (cfg.endpoints as unknown as Record<string, unknown>).cancel;
    expect(isValidConfig(cfg)).toBe(false);
  });

  it("rejects config without stream chunkFormat", () => {
    const cfg = makeConfig();
    delete (cfg.stream as unknown as Record<string, unknown>).chunkFormat;
    expect(isValidConfig(cfg)).toBe(false);
  });

  it("rejects config without stream mode", () => {
    const cfg = makeConfig();
    delete (cfg.stream as unknown as Record<string, unknown>).mode;
    expect(isValidConfig(cfg)).toBe(false);
  });

  it("rejects endpoint path not starting with /", () => {
    const cfg = makeConfig();
    (cfg.endpoints.start as unknown as Record<string, unknown>).path = "api/research";
    expect(isValidConfig(cfg)).toBe(false);
  });
});

describe("ApiProbeAdapter.normalizeChunk (passthrough)", () => {
  const adapter = new ApiProbeAdapter("http://localhost:5002", makeConfig());

  it("returns null for empty input", () => {
    expect(adapter.normalizeChunk("")).toBeNull();
    expect(adapter.normalizeChunk("   ")).toBeNull();
  });

  it("parses valid deep_research_status chunk", () => {
    const raw = JSON.stringify({
      type: "deep_research_status",
      content: {
        stage: "research", event_type: "activity", message: "Searching...",
        display_text: "Searching...", log_entry: "activity", ui_visible: true,
        details: {}, timestamp: "2025-01-01T00:00:00Z",
      },
    });
    const result = unwrapSingle(adapter.normalizeChunk(raw));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("deep_research_status");
  });

  it("parses token chunk", () => {
    const raw = JSON.stringify({ type: "token", content: "Hello " });
    const result = unwrapSingle(adapter.normalizeChunk(raw));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("token");
    if (result!.type === "token") {
      expect(result!.content).toBe("Hello ");
    }
  });

  it("parses error chunk", () => {
    const raw = JSON.stringify({ type: "error", content: { message: "Failed" } });
    const result = unwrapSingle(adapter.normalizeChunk(raw));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("error");
  });

  it("rejects chunk with invalid type", () => {
    expect(adapter.normalizeChunk(JSON.stringify({ type: "unknown", content: {} }))).toBeNull();
  });

  it("strips data: prefix", () => {
    const raw = `data: ${JSON.stringify({ type: "token", content: "hi" })}`;
    expect(unwrapSingle(adapter.normalizeChunk(raw))).not.toBeNull();
  });

  it("returns null for [DONE] marker", () => {
    expect(adapter.normalizeChunk("data: [DONE]")).toBeNull();
    expect(adapter.normalizeChunk("[DONE]")).toBeNull();
  });

  it("rejects deep_research_status with non-object content", () => {
    expect(adapter.normalizeChunk(JSON.stringify({ type: "deep_research_status", content: "bad" }))).toBeNull();
  });

  it("rejects error with non-object content", () => {
    expect(adapter.normalizeChunk(JSON.stringify({ type: "error", content: "bad" }))).toBeNull();
  });

  it("parses valid message chunk", () => {
    const raw = JSON.stringify({ type: "message", content: { role: "assistant", text: "Hi" } });
    const result = unwrapSingle(adapter.normalizeChunk(raw));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("message");
  });

  it("rejects message with non-object content", () => {
    expect(adapter.normalizeChunk(JSON.stringify({ type: "message", content: "bad" }))).toBeNull();
  });

  it("rejects message with null content", () => {
    expect(adapter.normalizeChunk(JSON.stringify({ type: "message", content: null }))).toBeNull();
  });

  it("rejects token with non-string content", () => {
    expect(adapter.normalizeChunk(JSON.stringify({ type: "token", content: 42 }))).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(adapter.normalizeChunk("{broken json}")).toBeNull();
  });
});

describe("ApiProbeAdapter.normalizeChunk (SSE)", () => {
  const config = makeConfig({ stream: { mode: "direct", chunkFormat: "sse" } });
  const adapter = new ApiProbeAdapter("http://localhost:5002", config);

  it("parses SSE formatted chunk", () => {
    const raw = 'event: research\ndata: {"event_type":"activity","message":"Working..."}';
    const result = unwrapSingle(adapter.normalizeChunk(raw));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("deep_research_status");
  });

  it("returns null for SSE without data", () => {
    expect(adapter.normalizeChunk("event: heartbeat")).toBeNull();
  });
});

describe("detect", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    vi.mocked(getAdapterConfig).mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns adapter when env var provides valid config", async () => {
    vi.mocked(getAdapterConfig).mockReturnValue(makeConfig({ name: "env-backend" }));

    const result = await detect("http://localhost:5002");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("env-backend");
    expect(vi.mocked(globalThis.fetch)).not.toHaveBeenCalled();
  });

  it("warns and falls back when env var config is invalid", async () => {
    vi.mocked(getAdapterConfig).mockReturnValue({ invalid: true });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // well-known
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // openapi
    fetchMock.mockResolvedValueOnce(new Response("OK", { status: 200 })); // health

    const result = await detect("http://localhost:5002");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("invalid"));
    expect(result).not.toBeNull();
    expect(result!.name).toBe("api-probe");
  });

  it("returns adapter when OpenAPI spec reveals research endpoints", async () => {
    const openApiSpec = {
      info: { title: "Research API" },
      paths: {
        "/api/deep-research": { post: { summary: "Start research" } },
        "/api/cancel": { post: { summary: "Cancel research" } },
      },
    };
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // well-known
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(openApiSpec), { status: 200 }),
    );

    const result = await detect("http://localhost:5002");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Research API");
  });

  it("returns adapter with defaults when server is alive but unrecognized", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // well-known
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // openapi
    fetchMock.mockResolvedValueOnce(new Response("OK", { status: 200 })); // health

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await detect("http://localhost:5002");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("api-probe");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("not auto-detected"));
  });

  it("returns null when server is unreachable", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await detect("http://localhost:5002");
    expect(result).toBeNull();
  });

  it("discovers start path from OpenAPI but uses default cancel if none found", async () => {
    const openApiSpec = {
      info: { title: "Agent API" },
      paths: {
        "/v1/agent/stream": { post: { summary: "Run agent" } },
      },
    };
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // well-known
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(openApiSpec), { status: 200 }),
    );

    const result = await detect("http://localhost:5002");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Agent API");
  });

  it("returns null when OpenAPI spec has no paths field", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // well-known
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ info: { title: "Empty" } }), { status: 200 }),
    );
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await detect("http://localhost:5002");
    expect(result).toBeNull();
  });

  it("skips OpenAPI paths that only have GET methods", async () => {
    const openApiSpec = {
      info: { title: "GET Only" },
      paths: {
        "/api/research": { get: { summary: "Get research" } },
        "/api/stream": { get: { summary: "Stream data" } },
      },
    };
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // well-known
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(openApiSpec), { status: 200 }),
    );
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const result = await detect("http://localhost:5002");
    expect(result).toBeNull();
  });

  it("skips OpenAPI when spec has no matching paths", async () => {
    const openApiSpec = {
      info: { title: "Unrelated" },
      paths: {
        "/api/users": { get: { summary: "List users" } },
        "/api/login": { post: { summary: "Login" } },
      },
    };
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // well-known
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(openApiSpec), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response("OK", { status: 200 })); // health

    const result = await detect("http://localhost:5002");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("api-probe");
  });

  it("returns adapter from well-known config endpoint", async () => {
    const validConfig = makeConfig({ name: "well-known-backend" });
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(validConfig), { status: 200 }),
    );
    vi.spyOn(console, "info").mockImplementation(() => {});

    const result = await detect("http://localhost:5002");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("well-known-backend");
  });

  it("falls back to / when /health returns non-ok", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // well-known
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // openapi
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 })); // /health
    fetchMock.mockResolvedValueOnce(new Response("OK", { status: 200 })); // /
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await detect("http://localhost:5002");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("api-probe");
  });

  it("returns null when all health endpoints fail", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // well-known
    fetchMock.mockResolvedValueOnce(new Response("", { status: 404 })); // openapi
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 })); // /health
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 })); // /

    const result = await detect("http://localhost:5002");
    expect(result).toBeNull();
  });
});

describe("ApiProbeAdapter.startResearch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns reader in direct stream mode", async () => {
    const adapter = new ApiProbeAdapter("http://localhost:5002", makeConfig());
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("stream data", { status: 200 }));

    const handle = await adapter.startResearch({
      message: "test", threadId: "t1", sessionId: "s1", userId: "u1",
    });
    expect(handle.reader).toBeDefined();
    expect(handle.streamId).toBeUndefined();
  });

  it("handles two-step mode with relative URL", async () => {
    const config = makeConfig({ stream: { mode: "two-step", chunkFormat: "passthrough" } });
    const adapter = new ApiProbeAdapter("http://localhost:5002", config);
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ stream_url: "/v1/stream/abc123" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response("sse data", { status: 200 }));

    const handle = await adapter.startResearch({
      message: "test", threadId: "t1", sessionId: "s1", userId: "u1",
    });
    expect(handle.reader).toBeDefined();
    expect(handle.streamId).toBe("abc123");
  });

  it("handles two-step mode with absolute URL", async () => {
    const config = makeConfig({ stream: { mode: "two-step", chunkFormat: "passthrough" } });
    const adapter = new ApiProbeAdapter("http://localhost:5002", config);
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ stream_url: "https://other.host/stream/xyz" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response("sse data", { status: 200 }));

    const handle = await adapter.startResearch({
      message: "test", threadId: "t1", sessionId: "s1", userId: "u1",
    });
    expect(handle.streamId).toBe("xyz");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://other.host/stream/xyz",
      expect.anything(),
    );
  });

  it("uses custom streamUrlField in two-step mode", async () => {
    const config = makeConfig({
      stream: { mode: "two-step", chunkFormat: "passthrough", streamUrlField: "custom_url" },
    });
    const adapter = new ApiProbeAdapter("http://localhost:5002", config);
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ custom_url: "/v1/stream/xyz" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response("data", { status: 200 }));

    const handle = await adapter.startResearch({
      message: "test", threadId: "t1", sessionId: "s1", userId: "u1",
    });
    expect(handle.streamId).toBe("xyz");
  });

  it("throws when two-step response has no stream_url", async () => {
    const config = makeConfig({ stream: { mode: "two-step", chunkFormat: "passthrough" } });
    const adapter = new ApiProbeAdapter("http://localhost:5002", config);
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({}), { status: 200 }),
    );

    await expect(
      adapter.startResearch({ message: "test", threadId: "t1", sessionId: "s1", userId: "u1" }),
    ).rejects.toThrow("No stream_url in response");
  });

  it("throws when two-step SSE response fails", async () => {
    const config = makeConfig({ stream: { mode: "two-step", chunkFormat: "passthrough" } });
    const adapter = new ApiProbeAdapter("http://localhost:5002", config);
    const fetchMock = vi.mocked(globalThis.fetch);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ stream_url: "/v1/stream/abc" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(
      adapter.startResearch({ message: "test", threadId: "t1", sessionId: "s1", userId: "u1" }),
    ).rejects.toThrow("stream error: 500");
  });

  it("throws on HTTP error from endpoint", async () => {
    const adapter = new ApiProbeAdapter("http://localhost:5002", makeConfig());
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 503 }));

    await expect(
      adapter.startResearch({ message: "test", threadId: "t1", sessionId: "s1", userId: "u1" }),
    ).rejects.toThrow("HTTP error: 503");
  });

  it("passes token and signal to endpoint", async () => {
    const adapter = new ApiProbeAdapter("http://localhost:5002", makeConfig());
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("data", { status: 200 }));

    const controller = new AbortController();
    await adapter.startResearch({
      message: "test", threadId: "t1", sessionId: "s1", userId: "u1",
      token: "my-token", signal: controller.signal,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/research"),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Token": "my-token" }),
      }),
    );
  });

  it("passes token and signal in two-step SSE fetch", async () => {
    const config = makeConfig({ stream: { mode: "two-step", chunkFormat: "passthrough" } });
    const adapter = new ApiProbeAdapter("http://localhost:5002", config);
    const fetchMock = vi.mocked(globalThis.fetch);
    const controller = new AbortController();

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ stream_url: "/v1/stream/abc" }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response("sse data", { status: 200 }));

    await adapter.startResearch({
      message: "test", threadId: "t1", sessionId: "s1", userId: "u1",
      token: "tk", signal: controller.signal,
    });

    const secondCall = fetchMock.mock.calls[1];
    expect((secondCall[1] as RequestInit).headers).toEqual({ "X-Token": "tk" });
    expect((secondCall[1] as RequestInit).signal).toBe(controller.signal);
  });
});

describe("ApiProbeAdapter.cancelResearch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends cancel request successfully", async () => {
    const adapter = new ApiProbeAdapter("http://localhost:5002", makeConfig());
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("", { status: 200 }));

    await adapter.cancelResearch("thread-123", "my-token");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/cancel/thread-123"),
      expect.anything(),
    );
  });

  it("catches and warns on cancel failure", async () => {
    const adapter = new ApiProbeAdapter("http://localhost:5002", makeConfig());
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockRejectedValueOnce(new Error("Network error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await adapter.cancelResearch("thread-123");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("cancel failed"),
      expect.any(Error),
    );
  });
});

describe("ApiProbeAdapter.approvePlan", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when planApproval endpoint is not configured", async () => {
    const adapter = new ApiProbeAdapter("http://localhost:5002", makeConfig());

    await expect(
      adapter.approvePlan({
        message: "test", threadId: "t1", sessionId: "s1", userId: "u1",
        plan: ["step1"],
      }),
    ).rejects.toThrow("does not support plan approval");
  });

  it("sends plan approval request and returns reader", async () => {
    const config = makeConfig({
      endpoints: {
        start: { path: "/api/research", method: "POST", bodyMapping: { query: "{{message}}" } },
        cancel: { path: "/api/cancel/{{threadId}}", method: "POST" },
        planApproval: { path: "/api/approve", method: "POST", bodyMapping: { plan: "{{plan}}" } },
      },
    });
    const adapter = new ApiProbeAdapter("http://localhost:5002", config);
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(new Response("stream", { status: 200 }));

    const handle = await adapter.approvePlan({
      message: "test", threadId: "t1", sessionId: "s1", userId: "u1",
      plan: ["step1", "step2"],
    });
    expect(handle.reader).toBeDefined();
  });
});

describe("ApiProbeAdapter.sendSteeringMessage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws when steering endpoint is not configured", async () => {
    const adapter = new ApiProbeAdapter("http://localhost:5002", makeConfig());

    await expect(
      adapter.sendSteeringMessage("session-1", "go deeper"),
    ).rejects.toThrow("does not support steering");
  });

  it("sends steering message and returns response JSON", async () => {
    const config = makeConfig({
      endpoints: {
        start: { path: "/api/research", method: "POST", bodyMapping: { query: "{{message}}" } },
        cancel: { path: "/api/cancel/{{threadId}}", method: "POST" },
        steering: { path: "/api/steer", method: "POST", bodyMapping: { message: "{{message}}" } },
      },
    });
    const adapter = new ApiProbeAdapter("http://localhost:5002", config);
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: "ok" }), { status: 200 }),
    );

    const result = await adapter.sendSteeringMessage("session-1", "go deeper");
    expect(result).toEqual({ status: "ok" });
  });
});

describe("ApiProbeAdapter.normalizeChunk (SSE with eventMapping)", () => {
  const config = makeConfig({
    stream: { mode: "direct", chunkFormat: "sse" },
    eventMapping: {
      activity: {
        stage: "research",
        eventType: "activity",
        messageField: "message",
      },
      heartbeat: "ignore",
      error_event: {
        stage: "research",
        eventType: "error",
        messageField: "message",
      },
      report_ready: {
        stage: "complete",
        eventType: "final_answer",
        messageField: "message",
        displayTextField: "display_text",
        reportField: "report",
      },
      hidden: {
        stage: "research",
        eventType: "hidden_step",
        messageField: "message",
        uiVisible: false,
      },
    },
  });
  const adapter = new ApiProbeAdapter("http://localhost:5002", config);

  it("maps event via eventMapping", () => {
    const raw = 'data: {"event_type":"activity","message":"Searching..."}';
    const result = unwrapSingle(adapter.normalizeChunk(raw));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("deep_research_status");
    if (result!.type === "deep_research_status") {
      expect(result!.content.stage).toBe("research");
      expect(result!.content.message).toBe("Searching...");
    }
  });

  it("returns null for ignored events", () => {
    const raw = 'data: {"event_type":"heartbeat"}';
    expect(adapter.normalizeChunk(raw)).toBeNull();
  });

  it("returns error chunk for error eventType mapping", () => {
    const raw = 'data: {"event_type":"error_event","message":"Something failed"}';
    const result = unwrapSingle(adapter.normalizeChunk(raw));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("error");
  });

  it("extracts reportField and displayTextField", () => {
    const raw = 'data: {"event_type":"report_ready","message":"Done","display_text":"Report ready","report":"Full report"}';
    const result = unwrapSingle(adapter.normalizeChunk(raw));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("deep_research_status");
    if (result!.type === "deep_research_status") {
      expect(result!.content.details.report).toBe("Full report");
      expect(result!.content.display_text).toBe("Report ready");
    }
  });

  it("sets uiVisible to false when mapping specifies it", () => {
    const raw = 'data: {"event_type":"hidden","message":"Background work"}';
    const result = unwrapSingle(adapter.normalizeChunk(raw));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("deep_research_status");
    if (result!.type === "deep_research_status") {
      expect(result!.content.ui_visible).toBe(false);
    }
  });

  it("falls back to buildDefaultEvent for unmapped events", () => {
    const raw = 'data: {"event_type":"unmapped_event","message":"Something"}';
    const result = unwrapSingle(adapter.normalizeChunk(raw));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("deep_research_status");
  });

  it("returns null for malformed JSON in SSE data", () => {
    expect(adapter.normalizeChunk("data: {invalid json}")).toBeNull();
  });

  it("injects eventType from SSE event line when not in data", () => {
    const raw = 'event: activity\ndata: {"message":"Searching..."}';
    const result = unwrapSingle(adapter.normalizeChunk(raw));
    expect(result).not.toBeNull();
    expect(result!.type).toBe("deep_research_status");
  });
});
