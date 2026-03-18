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
});
