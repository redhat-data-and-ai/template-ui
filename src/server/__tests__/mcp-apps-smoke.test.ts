/**
 * Compliance smoke tests for the MCP Apps host (UI side).
 *
 * Covers sandbox serving, feature flag, BFF proxy contracts, and that
 * features.mcp_apps_enabled is exposed to the frontend.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTestServer } from "./test-utils.js";
import { resetSettings } from "../utils/settings.js";

function stubFetch(response: Response) {
  const mockFetch = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

function okJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("MCP Apps host smoke (UI)", () => {
  beforeEach(() => {
    resetSettings();
    process.env.FEATURE_AUTH_ENABLED = "false";
    process.env.AUTH_ENABLED = "false";
    process.env.AGENT_ENDPOINT = "http://127.0.0.1:19999";
    delete process.env.FEATURE_MCP_APPS_ENABLED;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FEATURE_MCP_APPS_ENABLED;
    delete process.env.AGENT_ENDPOINT;
    delete process.env.AUTH_ENABLED;
    resetSettings();
  });

  it("serves sandbox_proxy.html with SEP omit-CSP defaults", async () => {
    const server = await buildTestServer();
    const res = await server.inject({ method: "GET", url: "/sandbox_proxy.html" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain("sandbox_proxy.js");
    const csp = res.headers["content-security-policy"] as string;
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("sandbox_proxy.js applies permissions from query param", async () => {
    const server = await buildTestServer();
    const res = await server.inject({ method: "GET", url: "/sandbox_proxy.js" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('params.get("permissions")');
    expect(res.body).toContain("buildAllowAttribute");
  });

  it("exposes mcp_apps_enabled on /api/config/features", async () => {
    const server = await buildTestServer();
    const res = await server.inject({ method: "GET", url: "/api/config/features" });
    expect(res.statusCode).toBe(200);
    expect(res.json().mcp_apps_enabled).toBe(true);
  });

  it("BFF rejects empty resources/read uri before calling the agent", async () => {
    const mockFetch = stubFetch(okJson({}));
    const server = await buildTestServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/proxy/agent/mcp/charts/resources/read",
      payload: { uri: "" },
    });
    expect(res.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("BFF forwards any resources/read uri to the agent", async () => {
    const mockFetch = stubFetch(okJson({ contents: [{ text: '{"ok":true}' }] }));
    const server = await buildTestServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/proxy/agent/mcp/charts/resources/read",
      payload: { uri: "showcase://sample.json" },
    });
    expect(res.statusCode).toBe(200);
    expect(mockFetch).toHaveBeenCalled();
    const [agentUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toContain("/mcp/charts/resources/read");
    expect(JSON.parse(String(init.body))).toEqual({ uri: "showcase://sample.json" });
  });

  it("BFF forwards resources/list to the agent", async () => {
    const mockFetch = stubFetch(okJson({ resources: [] }));
    const server = await buildTestServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/proxy/agent/mcp/charts/resources/list",
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const [agentUrl] = mockFetch.mock.calls[0] as [string];
    expect(agentUrl).toContain("/mcp/charts/resources/list");
  });

  it("BFF forwards resources/templates/list to the agent", async () => {
    const mockFetch = stubFetch(okJson({ resourceTemplates: [] }));
    const server = await buildTestServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/proxy/agent/mcp/charts/resources/templates/list",
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const [agentUrl] = mockFetch.mock.calls[0] as [string];
    expect(agentUrl).toContain("/mcp/charts/resources/templates/list");
  });

  it("BFF forwards app tools/call to the agent", async () => {
    const mockFetch = stubFetch(
      okJson({ content: [{ type: "text", text: "ok" }], isError: false }),
    );
    const server = await buildTestServer();
    const res = await server.inject({
      method: "POST",
      url: "/api/proxy/agent/mcp/charts/tools/call",
      payload: { name: "refresh_showcase", arguments: { topic: "demo" } },
    });
    expect(res.statusCode).toBe(200);
    const [agentUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toContain("/mcp/charts/tools/call");
    expect(JSON.parse(String(init.body))).toEqual({
      name: "refresh_showcase",
      arguments: { topic: "demo" },
    });
  });

  it("disabling mcp_apps hides the sandbox", async () => {
    process.env.FEATURE_MCP_APPS_ENABLED = "false";
    resetSettings();
    const server = await buildTestServer();
    const res = await server.inject({ method: "GET", url: "/sandbox_proxy.html" });
    expect(res.statusCode).toBe(404);
  });
});
