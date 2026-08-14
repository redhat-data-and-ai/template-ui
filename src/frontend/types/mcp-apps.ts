/**
 * MCP Apps descriptor attached to AI tool_calls after a UI-capable tool runs.
 * Produced by template-agent (mcpApp on tool messages / mergeToolResult).
 */

/** SEP-1865 MVP MIME type for HTML MCP App resources. */
export const MCP_APP_RESOURCE_MIME_TYPE = "text/html;profile=mcp-app";

export interface McpAppToolResult {
  content?: Array<Record<string, unknown>>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

export interface McpAppDescriptor {
  server: string;
  resourceUri: string;
  toolName?: string;
  visibility?: string[];
  result?: McpAppToolResult;
  /** Tool-call arguments (filled from tool_call.args if the agent omitted them). */
  arguments?: Record<string, unknown>;
}

export function parseMcpApp(value: unknown): McpAppDescriptor | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const obj = value as Record<string, unknown>;
  const server = typeof obj.server === "string" ? obj.server : "";
  const resourceUri =
    typeof obj.resourceUri === "string"
      ? obj.resourceUri
      : typeof obj.resource_uri === "string"
        ? obj.resource_uri
        : "";
  if (!server || !resourceUri.startsWith("ui://")) {
    return null;
  }
  return {
    server,
    resourceUri,
    toolName: typeof obj.toolName === "string" ? obj.toolName : undefined,
    visibility: Array.isArray(obj.visibility)
      ? obj.visibility.filter((v): v is string => typeof v === "string")
      : undefined,
    result:
      obj.result && typeof obj.result === "object" && !Array.isArray(obj.result)
        ? (obj.result as McpAppToolResult)
        : undefined,
    arguments:
      obj.arguments && typeof obj.arguments === "object" && !Array.isArray(obj.arguments)
        ? (obj.arguments as Record<string, unknown>)
        : undefined,
  };
}

/** CSP domains from resource `_meta.ui.csp` (MCP Apps). */
export interface McpAppResourceCsp {
  connectDomains?: string[];
  resourceDomains?: string[];
  frameDomains?: string[];
  baseUriDomains?: string[];
}

function asDomainList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const list = value.filter((x): x is string => typeof x === "string" && x.length > 0);
  return list.length > 0 ? list : undefined;
}

/** Parse `_meta.ui.csp` (or snake_case) from a resource contents entry / ui meta object. */
export function parseMcpAppResourceCsp(value: unknown): McpAppResourceCsp | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const cspRaw =
    obj.csp && typeof obj.csp === "object" && !Array.isArray(obj.csp)
      ? (obj.csp as Record<string, unknown>)
      : obj;
  const connectDomains = asDomainList(
    cspRaw.connectDomains ?? cspRaw.connect_domains,
  );
  const resourceDomains = asDomainList(
    cspRaw.resourceDomains ?? cspRaw.resource_domains,
  );
  const frameDomains = asDomainList(cspRaw.frameDomains ?? cspRaw.frame_domains);
  const baseUriDomains = asDomainList(
    cspRaw.baseUriDomains ?? cspRaw.base_uri_domains,
  );
  if (!connectDomains && !resourceDomains && !frameDomains && !baseUriDomains) {
    return undefined;
  }
  return { connectDomains, resourceDomains, frameDomains, baseUriDomains };
}

/** Sandbox Permission Policy flags from resource `_meta.ui.permissions`. */
export interface McpAppResourcePermissions {
  camera?: Record<string, never>;
  microphone?: Record<string, never>;
  geolocation?: Record<string, never>;
  clipboardWrite?: Record<string, never>;
}

type ResourceReadPayload = {
  contents?: Array<{
    _meta?: { ui?: unknown; [key: string]: unknown };
    meta?: { ui?: unknown; [key: string]: unknown };
    [key: string]: unknown;
  }>;
  _meta?: { ui?: unknown };
  [key: string]: unknown;
};

function contentUiMeta(result: ResourceReadPayload): unknown {
  const content = result.contents?.[0];
  const contentMeta = content?._meta ?? content?.meta;
  return contentMeta?.ui ?? contentMeta;
}

/**
 * Extract CSP from a resources/read payload (content-level `_meta.ui`, then top-level).
 */
export function extractCspFromResourceRead(
  result: ResourceReadPayload,
): McpAppResourceCsp | undefined {
  const fromContent = parseMcpAppResourceCsp(contentUiMeta(result));
  if (fromContent) return fromContent;
  return parseMcpAppResourceCsp(result._meta?.ui);
}

/** Parse `_meta.ui.permissions` (or snake_case) from a ui meta object. */
export function parseMcpAppResourcePermissions(
  value: unknown,
): McpAppResourcePermissions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  const raw =
    obj.permissions && typeof obj.permissions === "object" && !Array.isArray(obj.permissions)
      ? (obj.permissions as Record<string, unknown>)
      : obj;

  const granted: McpAppResourcePermissions = {};
  if (raw.camera && typeof raw.camera === "object") granted.camera = {};
  if (raw.microphone && typeof raw.microphone === "object") granted.microphone = {};
  if (raw.geolocation && typeof raw.geolocation === "object") granted.geolocation = {};
  const clipboard = raw.clipboardWrite ?? raw.clipboard_write;
  if (clipboard && typeof clipboard === "object") granted.clipboardWrite = {};

  return Object.keys(granted).length > 0 ? granted : undefined;
}

/**
 * Extract permissions from a resources/read payload (content-level `_meta.ui`, then top-level).
 */
export function extractPermissionsFromResourceRead(
  result: ResourceReadPayload,
): McpAppResourcePermissions | undefined {
  const fromContent = parseMcpAppResourcePermissions(contentUiMeta(result));
  if (fromContent) return fromContent;
  return parseMcpAppResourcePermissions(result._meta?.ui);
}

/** Pull `_meta.ui` from a resources/list entry (draft listing-level metadata). */
export function extractUiMetaFromListedResource(
  entry: Record<string, unknown> | null | undefined,
): unknown {
  if (!entry || typeof entry !== "object") return undefined;
  const meta = entry._meta ?? entry.meta;
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return undefined;
  const ui = (meta as Record<string, unknown>).ui;
  return ui ?? undefined;
}

/**
 * Prefer CSP/permissions from resources/read; fall back to matching resources/list entry.
 * Draft: hosts MUST check both locations, content-item first.
 */
export function resolveCspAndPermissionsFromReadAndList(
  resourceUri: string,
  readResult: ResourceReadPayload,
  listResult?: { resources?: Array<Record<string, unknown>> } | null,
): {
  csp?: McpAppResourceCsp;
  permissions?: McpAppResourcePermissions;
} {
  let csp = extractCspFromResourceRead(readResult);
  let permissions = extractPermissionsFromResourceRead(readResult);
  if (csp && permissions) {
    return { csp, permissions };
  }
  const resources = listResult?.resources;
  if (!Array.isArray(resources)) {
    return { csp, permissions };
  }
  const entry = resources.find(
    (r) => r && typeof r === "object" && typeof r.uri === "string" && r.uri === resourceUri,
  );
  const listUi = extractUiMetaFromListedResource(entry);
  if (!csp) csp = parseMcpAppResourceCsp(listUi);
  if (!permissions) permissions = parseMcpAppResourcePermissions(listUi);
  return { csp, permissions };
}

export type McpAppResourceListPage = {
  resources?: Array<Record<string, unknown>>;
  nextCursor?: string;
};

/**
 * Same as resolveCspAndPermissionsFromReadAndList, but walks paginated resources/list
 * until the matching uri is found or pages are exhausted.
 */
export async function resolveCspAndPermissionsWithListFallback(
  resourceUri: string,
  readResult: ResourceReadPayload,
  listPage: (cursor?: string) => Promise<McpAppResourceListPage>,
  maxPages = 20,
  signal?: AbortSignal,
): Promise<{
  csp?: McpAppResourceCsp;
  permissions?: McpAppResourcePermissions;
}> {
  const fromReadCsp = extractCspFromResourceRead(readResult);
  const fromReadPermissions = extractPermissionsFromResourceRead(readResult);
  if (fromReadCsp && fromReadPermissions) {
    return { csp: fromReadCsp, permissions: fromReadPermissions };
  }

  let cursor: string | undefined;
  let csp = fromReadCsp;
  let permissions = fromReadPermissions;
  for (let page = 0; page < maxPages; page += 1) {
    if (signal?.aborted) {
      return { csp, permissions };
    }
    const listed = await listPage(cursor);
    const resolved = resolveCspAndPermissionsFromReadAndList(
      resourceUri,
      readResult,
      listed,
    );
    const entry = (listed.resources ?? []).find(
      (r) => r && typeof r.uri === "string" && r.uri === resourceUri,
    );
    if (entry) {
      return resolved;
    }
    csp = resolved.csp;
    permissions = resolved.permissions;
    const next = listed.nextCursor;
    if (typeof next !== "string" || !next) {
      return { csp, permissions };
    }
    cursor = next;
  }
  return { csp, permissions };
}

/** Merge mcpApp with arguments, preferring mcpApp.arguments over tool-call args. */
export function withMcpAppArguments(
  mcpApp: Record<string, unknown>,
  fallbackArgs?: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...mcpApp,
    arguments:
      (mcpApp.arguments as Record<string, unknown> | undefined) ??
      fallbackArgs ??
      {},
  };
}

/**
 * Validate a UI resources/read payload before mounting.
 * Returns an error message when the host should fail closed; otherwise null.
 */
export function validateMcpAppResourceRead(
  resourceUri: string,
  result: ResourceReadPayload,
): string | null {
  if (!resourceUri.startsWith("ui://")) {
    return `UI resource URI must use ui:// (got ${resourceUri})`;
  }
  const content = result.contents?.[0];
  if (!content || typeof content !== "object") {
    return "UI resource read returned no contents";
  }
  const contentUri =
    typeof content.uri === "string" && content.uri ? content.uri : resourceUri;
  if (!contentUri.startsWith("ui://")) {
    return `UI resource content URI must use ui:// (got ${contentUri})`;
  }
  const mime = typeof content.mimeType === "string" ? content.mimeType : "";
  if (mime !== MCP_APP_RESOURCE_MIME_TYPE) {
    return `Unsupported MCP App MIME type (expected ${MCP_APP_RESOURCE_MIME_TYPE}, got ${mime || "missing"})`;
  }
  const hasText = typeof content.text === "string";
  const hasBlob = typeof content.blob === "string";
  if (!hasText && !hasBlob) {
    return "UI resource content missing text/blob";
  }

  const html = decodeMcpAppHtmlContent(content);
  if (html === null) {
    return "UI resource content could not be decoded";
  }
  if (html.includes("\0")) {
    return "UI resource contains NUL bytes";
  }
  // SEP-1865: content MUST be a valid HTML5 document.
  if (!/^\s*(?:\uFEFF)?<!DOCTYPE\s+html\b/i.test(html) || !/<html\b/i.test(html)) {
    return "UI resource is not a valid HTML5 document";
  }
  return null;
}

/** Decode the first contents[] entry to HTML after a successful validate. */
export function extractMcpAppHtmlFromResourceRead(
  result: ResourceReadPayload,
): string | null {
  const content = result.contents?.[0];
  if (!content || typeof content !== "object") return null;
  return decodeMcpAppHtmlContent(content);
}

/** Decode UI resource text or base64 blob to a UTF-8 HTML string. */
function decodeMcpAppHtmlContent(
  content: Record<string, unknown>,
): string | null {
  if (typeof content.text === "string") {
    return content.text;
  }
  if (typeof content.blob !== "string") {
    return null;
  }
  try {
    const binary = atob(content.blob);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Resolve sandbox_proxy.html on the current origin (same-origin interim).
 * Always sets `hostOrigin` so the proxy can target postMessage even when
 * Referrer-Policy strips document.referrer (Helmet default is no-referrer).
 * AppRenderer / AppFrame appends `csp` when SandboxConfig.csp is set.
 * Permissions are passed via query param because AppFrame does not forward
 * them in sandbox-resource-ready yet.
 */
export function getMcpAppsSandboxUrl(options?: {
  permissions?: McpAppResourcePermissions;
}): URL {
  const basePath = (globalThis.window?.APP_DATA?.basePath || "").replace(/\/$/, "");
  const path = basePath ? `${basePath}/sandbox_proxy.html` : "/sandbox_proxy.html";
  const origin =
    typeof globalThis.window !== "undefined" && globalThis.window.location?.origin
      ? globalThis.window.location.origin
      : "http://localhost";
  const url = new URL(path.startsWith("/") ? path : `/${path}`, origin);
  url.searchParams.set("hostOrigin", origin);
  if (options?.permissions && Object.keys(options.permissions).length > 0) {
    url.searchParams.set("permissions", JSON.stringify(options.permissions));
  }
  return url;
}

/** Extract plain text from MCP ContentBlock[] (ui/message / update-model-context). */
export function extractTextFromContentBlocks(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const rec = block as Record<string, unknown>;
    if (rec.type === "text" && typeof rec.text === "string" && rec.text.trim()) {
      parts.push(rec.text);
    }
  }
  return parts.join("\n").trim();
}

/**
 * Format a ui/update-model-context payload into a single string for the next agent turn.
 * Last write wins at the call site; this only formats one snapshot.
 */
export function formatMcpModelContext(update: {
  content?: unknown[];
  structuredContent?: Record<string, unknown>;
} | null): string | null {
  if (!update) return null;
  const parts: string[] = [];
  const text = extractTextFromContentBlocks(update.content);
  if (text) parts.push(text);
  if (
    update.structuredContent &&
    typeof update.structuredContent === "object" &&
    Object.keys(update.structuredContent).length > 0
  ) {
    try {
      parts.push(JSON.stringify(update.structuredContent, null, 2));
    } catch {
      // ignore non-serializable structured content
    }
  }
  const joined = parts.join("\n").trim();
  return joined || null;
}

/** Merge pending MCP App context into the outbound stream message (not the chat bubble). */
export function mergeMessageWithMcpModelContext(
  userMessage: string,
  mcpModelContext: string | null | undefined,
): string {
  const ctx = mcpModelContext?.trim();
  if (!ctx) return userMessage;
  return `${userMessage}\n\n[Context from interactive UI]\n${ctx}`;
}
