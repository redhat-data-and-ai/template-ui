import { describe, expect, it, vi } from "vitest";
import {
  extractCspFromResourceRead,
  extractPermissionsFromResourceRead,
  extractTextFromContentBlocks,
  formatMcpModelContext,
  getMcpAppsSandboxUrl,
  MCP_APP_RESOURCE_MIME_TYPE,
  mergeMessageWithMcpModelContext,
  parseMcpApp,
  parseMcpAppResourceCsp,
  parseMcpAppResourcePermissions,
  resolveCspAndPermissionsFromReadAndList,
  resolveCspAndPermissionsWithListFallback,
  validateMcpAppResourceRead,
} from "./mcp-apps";

describe("parseMcpApp", () => {
  it("accepts a valid descriptor", () => {
    const app = parseMcpApp({
      server: "charts",
      resourceUri: "ui://charts/app.html",
      toolName: "show_chart",
      arguments: { topic: "sales" },
      result: { content: [{ type: "text", text: "ok" }], isError: false },
    });
    expect(app).toEqual({
      server: "charts",
      resourceUri: "ui://charts/app.html",
      toolName: "show_chart",
      visibility: undefined,
      arguments: { topic: "sales" },
      result: { content: [{ type: "text", text: "ok" }], isError: false },
    });
  });

  it("accepts resource_uri snake_case", () => {
    const app = parseMcpApp({
      server: "charts",
      resource_uri: "ui://charts/app.html",
    });
    expect(app?.resourceUri).toBe("ui://charts/app.html");
  });

  it("rejects missing server or non-ui uri", () => {
    expect(parseMcpApp({ server: "x", resourceUri: "https://example.com" })).toBeNull();
    expect(parseMcpApp({ resourceUri: "ui://x" })).toBeNull();
    expect(parseMcpApp(null)).toBeNull();
    expect(parseMcpApp("ui://x")).toBeNull();
  });
});

describe("getMcpAppsSandboxUrl", () => {
  it("builds a same-origin sandbox_proxy.html URL with hostOrigin", () => {
    const url = getMcpAppsSandboxUrl();
    expect(url.pathname.endsWith("/sandbox_proxy.html") || url.pathname === "/sandbox_proxy.html").toBe(
      true,
    );
    expect(url.origin).toBe(window.location.origin);
    expect(url.searchParams.get("hostOrigin")).toBe(window.location.origin);
    expect(url.searchParams.get("permissions")).toBeNull();
  });

  it("includes permissions query param when granted", () => {
    const url = getMcpAppsSandboxUrl({
      permissions: { clipboardWrite: {}, camera: {} },
    });
    expect(JSON.parse(url.searchParams.get("permissions") || "")).toEqual({
      clipboardWrite: {},
      camera: {},
    });
  });
});

describe("parseMcpAppResourceCsp / extractCspFromResourceRead", () => {
  it("parses camelCase and snake_case domain lists", () => {
    expect(
      parseMcpAppResourceCsp({
        resource_domains: ["https://unpkg.com"],
        frame_domains: ["https://example.com"],
      }),
    ).toEqual({
      resourceDomains: ["https://unpkg.com"],
      frameDomains: ["https://example.com"],
      connectDomains: undefined,
      baseUriDomains: undefined,
    });
  });

  it("extracts content-level _meta.ui.csp from resources/read", () => {
    const csp = extractCspFromResourceRead({
      contents: [
        {
          text: "<html></html>",
          _meta: {
            ui: {
              csp: {
                resourceDomains: ["https://unpkg.com"],
                frameDomains: ["https://example.com"],
              },
            },
          },
        },
      ],
    });
    expect(csp?.frameDomains).toEqual(["https://example.com"]);
    expect(csp?.resourceDomains).toEqual(["https://unpkg.com"]);
  });
});

describe("resolveCspAndPermissionsFromReadAndList", () => {
  it("prefers resources/read over list metadata", () => {
    const resolved = resolveCspAndPermissionsFromReadAndList(
      "ui://charts/app.html",
      {
        contents: [
          {
            _meta: {
              ui: {
                csp: { connectDomains: ["https://from-read.example"] },
                permissions: { camera: {} },
              },
            },
          },
        ],
      },
      {
        resources: [
          {
            uri: "ui://charts/app.html",
            _meta: {
              ui: {
                csp: { connectDomains: ["https://from-list.example"] },
                permissions: { microphone: {} },
              },
            },
          },
        ],
      },
    );
    expect(resolved.csp?.connectDomains).toEqual(["https://from-read.example"]);
    expect(resolved.permissions).toEqual({ camera: {} });
  });

  it("falls back to resources/list when read omits CSP and permissions", () => {
    const resolved = resolveCspAndPermissionsFromReadAndList(
      "ui://charts/app.html",
      { contents: [{ text: "<!DOCTYPE html><html></html>" }] },
      {
        resources: [
          {
            uri: "ui://charts/app.html",
            _meta: {
              ui: {
                csp: {
                  resourceDomains: ["https://cdn.example"],
                  frameDomains: ["https://player.example"],
                },
                permissions: { geolocation: {} },
              },
            },
          },
        ],
      },
    );
    expect(resolved.csp).toEqual({
      resourceDomains: ["https://cdn.example"],
      frameDomains: ["https://player.example"],
      connectDomains: undefined,
      baseUriDomains: undefined,
    });
    expect(resolved.permissions).toEqual({ geolocation: {} });
  });
});

describe("resolveCspAndPermissionsWithListFallback", () => {
  it("walks paginated resources/list until the uri is found", async () => {
    const listPage = vi.fn()
      .mockResolvedValueOnce({
        resources: [{ uri: "ui://other/app.html" }],
        nextCursor: "page-2",
      })
      .mockResolvedValueOnce({
        resources: [
          {
            uri: "ui://charts/app.html",
            _meta: {
              ui: {
                csp: { connectDomains: ["https://page2.example"] },
                permissions: { camera: {} },
              },
            },
          },
        ],
      });

    const resolved = await resolveCspAndPermissionsWithListFallback(
      "ui://charts/app.html",
      { contents: [{ text: "<!DOCTYPE html><html></html>" }] },
      listPage,
    );

    expect(listPage).toHaveBeenCalledTimes(2);
    expect(listPage).toHaveBeenNthCalledWith(1, undefined);
    expect(listPage).toHaveBeenNthCalledWith(2, "page-2");
    expect(resolved.csp?.connectDomains).toEqual(["https://page2.example"]);
    expect(resolved.permissions).toEqual({ camera: {} });
  });

  it("skips list when read already has CSP and permissions", async () => {
    const listPage = vi.fn();
    const resolved = await resolveCspAndPermissionsWithListFallback(
      "ui://charts/app.html",
      {
        contents: [
          {
            _meta: {
              ui: {
                csp: { connectDomains: ["https://from-read.example"] },
                permissions: { microphone: {} },
              },
            },
          },
        ],
      },
      listPage,
    );
    expect(listPage).not.toHaveBeenCalled();
    expect(resolved.csp?.connectDomains).toEqual(["https://from-read.example"]);
    expect(resolved.permissions).toEqual({ microphone: {} });
  });
});

describe("validateMcpAppResourceRead", () => {
  const validHtml = "<!DOCTYPE html><html><body></body></html>";

  it("accepts ui:// HTML MCP App resources", () => {
    expect(
      validateMcpAppResourceRead("ui://charts/app.html", {
        contents: [
          {
            uri: "ui://charts/app.html",
            mimeType: MCP_APP_RESOURCE_MIME_TYPE,
            text: validHtml,
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects HTML without an HTML5 doctype", () => {
    expect(
      validateMcpAppResourceRead("ui://charts/app.html", {
        contents: [
          {
            uri: "ui://charts/app.html",
            mimeType: MCP_APP_RESOURCE_MIME_TYPE,
            text: "<html><body><p>no doctype</p></body></html>",
          },
        ],
      }),
    ).toMatch(/HTML5/i);
  });

  it("rejects wrong MIME and non-ui content URIs", () => {
    expect(
      validateMcpAppResourceRead("ui://charts/app.html", {
        contents: [
          {
            uri: "ui://charts/app.html",
            mimeType: "text/html",
            text: validHtml,
          },
        ],
      }),
    ).toMatch(/MIME type/i);

    expect(
      validateMcpAppResourceRead("ui://charts/app.html", {
        contents: [
          {
            uri: "https://evil.example/app.html",
            mimeType: MCP_APP_RESOURCE_MIME_TYPE,
            text: validHtml,
          },
        ],
      }),
    ).toMatch(/ui:\/\//);
  });

  it("accepts valid base64 blob HTML resources", () => {
    const blob = btoa(validHtml);
    expect(
      validateMcpAppResourceRead("ui://charts/app.html", {
        contents: [
          {
            uri: "ui://charts/app.html",
            mimeType: MCP_APP_RESOURCE_MIME_TYPE,
            blob,
          },
        ],
      }),
    ).toBeNull();
  });

  it("rejects HTML containing a NUL byte", () => {
    expect(
      validateMcpAppResourceRead("ui://charts/app.html", {
        contents: [
          {
            uri: "ui://charts/app.html",
            mimeType: MCP_APP_RESOURCE_MIME_TYPE,
            text: "<!DOCTYPE html><html><body>bad\0</body></html>",
          },
        ],
      }),
    ).toMatch(/NUL/i);
  });
});

describe("parseMcpAppResourcePermissions / extractPermissionsFromResourceRead", () => {
  it("parses known permission flags including snake_case clipboard", () => {
    expect(
      parseMcpAppResourcePermissions({
        permissions: {
          camera: {},
          clipboard_write: {},
          microphone: {},
        },
      }),
    ).toEqual({
      camera: {},
      microphone: {},
      clipboardWrite: {},
    });
  });

  it("extracts permissions from resources/read _meta.ui", () => {
    const permissions = extractPermissionsFromResourceRead({
      contents: [
        {
          text: "<html></html>",
          _meta: {
            ui: {
              permissions: { geolocation: {} },
            },
          },
        },
      ],
    });
    expect(permissions).toEqual({ geolocation: {} });
  });
});

describe("content / model-context helpers", () => {
  it("extractTextFromContentBlocks joins text blocks", () => {
    expect(
      extractTextFromContentBlocks([
        { type: "text", text: "Hello" },
        { type: "image", data: "x" },
        { type: "text", text: "world" },
      ]),
    ).toBe("Hello\nworld");
  });

  it("formatMcpModelContext includes text and structured JSON", () => {
    const formatted = formatMcpModelContext({
      content: [{ type: "text", text: "Selected: A" }],
      structuredContent: { choice: "A" },
    });
    expect(formatted).toContain("Selected: A");
    expect(formatted).toContain('"choice": "A"');
  });

  it("formatMcpModelContext returns null for empty updates", () => {
    expect(formatMcpModelContext({ content: [] })).toBeNull();
    expect(formatMcpModelContext(null)).toBeNull();
  });

  it("mergeMessageWithMcpModelContext appends context for the agent only", () => {
    expect(mergeMessageWithMcpModelContext("Hi", null)).toBe("Hi");
    expect(mergeMessageWithMcpModelContext("Hi", "ctx")).toContain("Hi");
    expect(mergeMessageWithMcpModelContext("Hi", "ctx")).toContain(
      "[Context from interactive UI]",
    );
    expect(mergeMessageWithMcpModelContext("Hi", "ctx")).toContain("ctx");
  });
});
