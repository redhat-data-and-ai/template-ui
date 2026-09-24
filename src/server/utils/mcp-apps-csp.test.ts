import { describe, expect, it } from "vitest";
import {
  buildSandboxCspHeader,
  parseCspQueryParam,
  sanitizeCspDomains,
} from "./mcp-apps-csp.js";

describe("sanitizeCspDomains", () => {
  it("drops injectable entries", () => {
    expect(
      sanitizeCspDomains([
        "https://example.com",
        "https://evil.com; script-src *",
        "https://x.com'token",
        "https://a.com https://b.com",
      ]),
    ).toEqual(["https://example.com"]);
  });

  it("drops CSP keywords and non-origin sources", () => {
    expect(
      sanitizeCspDomains([
        "https://cdn.example.com",
        "*",
        "unsafe-eval",
        "'unsafe-inline'",
        "data:",
        "blob:",
        "'self'",
        "https://*.cloudflare.com",
        "wss://realtime.example.com",
      ]),
    ).toEqual([
      "https://cdn.example.com",
      "https://*.cloudflare.com",
      "wss://realtime.example.com",
    ]);
  });
});

describe("buildSandboxCspHeader", () => {
  it("uses SEP restrictive defaults when CSP is omitted", () => {
    const csp = buildSandboxCspHeader();
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data:");
    expect(csp).toContain("media-src 'self' data: blob:");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toContain("https://example.com");
  });

  it("allows blob: on media-src when CSP meta is present", () => {
    const csp = buildSandboxCspHeader({
      resourceDomains: ["https://cdn.jsdelivr.net"],
    });
    expect(csp).toContain("media-src 'self' data: blob: https://cdn.jsdelivr.net");
  });

  it("appends only declared domains and keeps undeclared frame/connect denied", () => {
    const csp = buildSandboxCspHeader({
      resourceDomains: ["https://unpkg.com", "https://cdn.jsdelivr.net"],
      frameDomains: ["https://example.com"],
      connectDomains: ["https://api.example.com"],
    });
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("https://unpkg.com");
    expect(csp).toContain("https://cdn.jsdelivr.net");
    expect(csp).toContain("frame-src https://example.com");
    expect(csp).toContain("connect-src https://api.example.com");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/frame-src[^;]*'self'/);
    expect(csp).not.toMatch(/connect-src[^;]*'self'/);
    // resourceDomains must not leak into frame-src / connect-src
    expect(csp).not.toMatch(/frame-src[^;]*https:\/\/unpkg\.com/);
    expect(csp).not.toMatch(/frame-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
    expect(csp).not.toMatch(/connect-src[^;]*https:\/\/unpkg\.com/);
    expect(csp).not.toMatch(/connect-src[^;]*https:\/\/cdn\.jsdelivr\.net/);
  });

  it("uses frame-src none and connect-src none when those lists are omitted", () => {
    const csp = buildSandboxCspHeader({
      resourceDomains: ["https://unpkg.com"],
    });
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("https://unpkg.com");
  });
});

describe("parseCspQueryParam", () => {
  it("parses valid JSON", () => {
    expect(
      parseCspQueryParam(
        JSON.stringify({
          resourceDomains: ["https://unpkg.com"],
          frameDomains: ["https://example.com"],
        }),
      ),
    ).toEqual({
      resourceDomains: ["https://unpkg.com"],
      frameDomains: ["https://example.com"],
      connectDomains: undefined,
      baseUriDomains: undefined,
    });
  });

  it("returns undefined for invalid input", () => {
    expect(parseCspQueryParam("not-json")).toBeUndefined();
    expect(parseCspQueryParam(null)).toBeUndefined();
    expect(parseCspQueryParam("[]")).toBeUndefined();
  });
});
