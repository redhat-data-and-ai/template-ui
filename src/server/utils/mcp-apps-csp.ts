/**
 * Build Content-Security-Policy for the MCP Apps sandbox proxy page.
 * Matches SEP-1865 Host Behavior for omitted `_meta.ui.csp`, and only
 * appends domains the resource declared when CSP metadata is present.
 */

export interface McpAppsResourceCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

/**
 * Allow only origin-like CSP sources from resource metadata.
 * Rejects keywords (*, 'self', unsafe-*, data:, blob:) and injection characters.
 */
export function isAllowedCspOrigin(domain: string): boolean {
  if (typeof domain !== "string") return false;
  const trimmed = domain.trim();
  if (!trimmed || trimmed !== domain) return false;
  if (/[;\r\n'" ]/.test(trimmed)) return false;
  if (trimmed === "*" || trimmed.startsWith("'") || trimmed.endsWith("'")) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower === "unsafe-inline" ||
    lower === "unsafe-eval" ||
    lower === "unsafe-hashes" ||
    lower === "self" ||
    lower === "none" ||
    lower.startsWith("data:") ||
    lower.startsWith("blob:") ||
    lower.startsWith("filesystem:")
  ) {
    return false;
  }
  // https://host, http://host, wss://host, ws://host, optional https://*.host
  return /^(https?|wss?):\/\/(\*\.)?[A-Za-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(trimmed);
}

/** Reject entries that could break out of a CSP source list. */
export function sanitizeCspDomains(domains?: string[]): string[] {
  if (!domains) return [];
  return domains.filter((d) => typeof d === "string" && isAllowedCspOrigin(d));
}

function joinSources(...parts: Array<string | undefined>): string {
  return parts
    .flatMap((p) => (p ? p.split(/\s+/).filter(Boolean) : []))
    .join(" ");
}

/**
 * Build the sandbox CSP header from resource `_meta.ui.csp`.
 *
 * When CSP is omitted: SEP restrictive defaults + `frame-src 'none'` +
 * `object-src 'none'`. Always allows framing by the chat host
 * (`frame-ancestors 'self'`).
 *
 * When CSP is present: start from the same deny-by-default base and append
 * only declared domain lists (MUST NOT allow undeclared origins).
 */
export function buildSandboxCspHeader(csp?: McpAppsResourceCsp | null): string {
  const resourceDomains = sanitizeCspDomains(csp?.resourceDomains).join(" ");
  const connectDomains = sanitizeCspDomains(csp?.connectDomains).join(" ");
  const frameDomains = sanitizeCspDomains(csp?.frameDomains).join(" ");
  const baseUriDomains = sanitizeCspDomains(csp?.baseUriDomains).join(" ");

  const hasCspMeta = Boolean(
    resourceDomains || connectDomains || frameDomains || baseUriDomains,
  );

  if (!hasCspMeta) {
    // SEP Host Behavior when `_meta.ui.csp` is omitted.
    return [
      "default-src 'none'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
      // blob: for in-sandbox object URLs from host-proxied resources/read media.
      "media-src 'self' data: blob:",
      "connect-src 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'self'",
    ].join("; ");
  }

  const directives = [
    "default-src 'none'",
    joinSources("script-src 'self' 'unsafe-inline'", resourceDomains),
    joinSources("style-src 'self' 'unsafe-inline'", resourceDomains),
    joinSources("img-src 'self' data:", resourceDomains),
    joinSources("font-src 'self'", resourceDomains),
    joinSources("media-src 'self' data: blob:", resourceDomains),
    connectDomains ? `connect-src ${connectDomains}` : "connect-src 'none'",
    frameDomains ? `frame-src ${frameDomains}` : "frame-src 'none'",
    "object-src 'none'",
    baseUriDomains ? `base-uri ${baseUriDomains}` : "base-uri 'self'",
    "frame-ancestors 'self'",
  ];

  return directives.join("; ");
}

/** CSP for sandbox_proxy.js (static asset only). */
export const SANDBOX_JS_CSP =
  "default-src 'none'; script-src 'self'; frame-ancestors 'none'";

export function parseCspQueryParam(raw: unknown): McpAppsResourceCsp | undefined {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }
    const obj = parsed as Record<string, unknown>;
    const asStringArray = (v: unknown): string[] | undefined =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
    return {
      connectDomains: asStringArray(obj.connectDomains),
      resourceDomains: asStringArray(obj.resourceDomains),
      frameDomains: asStringArray(obj.frameDomains),
      baseUriDomains: asStringArray(obj.baseUriDomains),
    };
  } catch {
    return undefined;
  }
}
