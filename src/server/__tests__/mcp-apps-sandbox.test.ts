import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTestServer } from "./test-utils.js";
import { resetSettings } from "../utils/settings.js";

describe("MCP Apps sandbox proxy", () => {
  beforeEach(() => {
    resetSettings();
    process.env.FEATURE_AUTH_ENABLED = "false";
    process.env.AUTH_ENABLED = "false";
    delete process.env.FEATURE_MCP_APPS_ENABLED;
  });

  afterEach(() => {
    delete process.env.FEATURE_MCP_APPS_ENABLED;
    delete process.env.AUTH_ENABLED;
    resetSettings();
  });

  it("serves sandbox_proxy.html with frame-ancestors self", async () => {
    const server = await buildTestServer();
    const res = await server.inject({ method: "GET", url: "/sandbox_proxy.html" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("sandbox_proxy.js");

    const csp = res.headers["content-security-policy"];
    expect(csp).toBeDefined();
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");
    expect(res.headers["x-frame-options"]).toBe("SAMEORIGIN");
  });

  it("applies resource CSP from ?csp= query param", async () => {
    const server = await buildTestServer();
    const cspJson = JSON.stringify({
      resourceDomains: ["https://unpkg.com"],
      frameDomains: ["https://example.com"],
      baseUriDomains: ["https://example.com"],
    });
    const res = await server.inject({
      method: "GET",
      url: `/sandbox_proxy.html?csp=${encodeURIComponent(cspJson)}`,
    });

    expect(res.statusCode).toBe(200);
    const cspHeader = res.headers["content-security-policy"];
    // Single header only — duplicate helmet CSP would intersect and break base-uri.
    expect(Array.isArray(cspHeader)).toBe(false);
    const csp = cspHeader as string;
    expect(csp).toContain("https://unpkg.com");
    expect(csp).toContain("frame-src https://example.com");
    expect(csp).toContain("base-uri https://example.com");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("unsafe-eval");
  });

  it("serves sandbox_proxy.js", async () => {
    const server = await buildTestServer();
    const res = await server.inject({ method: "GET", url: "/sandbox_proxy.js" });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("javascript");
    expect(res.body).toContain("ui/notifications/sandbox-proxy-ready");
    expect(res.body).toContain("ui/notifications/sandbox-resource-ready");
    expect(res.body).toContain('params.get("permissions")');
    expect(res.body).toContain("buildAllowAttribute");
  });

  it("returns 404 when mcp_apps is disabled", async () => {
    process.env.FEATURE_MCP_APPS_ENABLED = "false";
    resetSettings();
    const server = await buildTestServer();

    const html = await server.inject({ method: "GET", url: "/sandbox_proxy.html" });
    const js = await server.inject({ method: "GET", url: "/sandbox_proxy.js" });

    expect(html.statusCode).toBe(404);
    expect(js.statusCode).toBe(404);
  });

  it("is reachable without auth session", async () => {
    // AUTH_ENABLED=true exercises auth-check (no session → redirect for protected routes).
    // Keep FEATURE_AUTH_ENABLED=false so the OAuth plugin is not registered in tests.
    process.env.AUTH_ENABLED = "true";
    process.env.FEATURE_AUTH_ENABLED = "false";
    resetSettings();
    const server = await buildTestServer();

    const res = await server.inject({ method: "GET", url: "/sandbox_proxy.html" });
    expect(res.statusCode).toBe(200);
  });

  it("exposes mcp_apps_enabled on /api/config/features", async () => {
    const server = await buildTestServer();
    const res = await server.inject({ method: "GET", url: "/api/config/features" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.mcp_apps_enabled).toBe(true);
  });
});
