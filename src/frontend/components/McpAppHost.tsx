import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSelector } from "react-redux";
import { AppRenderer, type AppRendererHandle } from "@mcp-ui/client";
import type {
  CallToolResult,
  JSONRPCRequest,
  ListResourcesResult,
  ListResourceTemplatesResult,
  ReadResourceResult,
} from "@modelcontextprotocol/sdk/types.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import {
  callMcpAppTool,
  listMcpAppResources,
  listMcpAppResourceTemplates,
  listMcpAppTools,
  readMcpAppResource,
} from "../services/mcp-apps-api";
import {
  extractMcpAppHtmlFromResourceRead,
  extractTextFromContentBlocks,
  getMcpAppsSandboxUrl,
  parseMcpApp,
  resolveCspAndPermissionsFromReadAndList,
  resolveCspAndPermissionsWithListFallback,
  validateMcpAppResourceRead,
  type McpAppDescriptor,
  type McpAppResourceCsp,
  type McpAppResourcePermissions,
} from "../types/mcp-apps";
import type { RootState } from "../redux/store";
import { selectTheme } from "../redux/slices/userSettings";
import { useChatActions } from "../contexts/ChatActionsContext";

export interface McpAppHostProps {
  mcpApp: McpAppDescriptor;
  /** Fallback tool name when mcpApp.toolName is missing. */
  toolName: string;
  /**
   * When true, notify the View that tool execution was cancelled
   * (no mcpApp.result after the tool call settled).
   */
  toolCancelled?: boolean;
  className?: string;
}

/** Stable host identity — AppRenderer recreates AppBridge if this object identity changes. */
const HOST_INFO = { name: "Template UI", version: "0.1.0" };

/** MCP Tool.inputSchema shape expected by AppRenderer / McpUiHostContext. */
type ToolInputSchema = {
  type: "object";
  properties?: Record<string, object>;
  required?: string[];
  [key: string]: unknown;
};

const DEFAULT_INPUT_SCHEMA: ToolInputSchema = { type: "object" };

function asToolInputSchema(value: unknown): ToolInputSchema | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const obj = value as Record<string, unknown>;
  if (obj.type !== "object") return undefined;
  const properties =
    obj.properties && typeof obj.properties === "object" && !Array.isArray(obj.properties)
      ? (obj.properties as Record<string, object>)
      : undefined;
  const required = Array.isArray(obj.required)
    ? obj.required.filter((r): r is string => typeof r === "string")
    : undefined;
  return {
    ...obj,
    type: "object",
    ...(properties ? { properties } : {}),
    ...(required ? { required } : {}),
  };
}

/** Max time to wait for View ack on ui/resource-teardown before destroying the iframe. */
const TEARDOWN_TIMEOUT_MS = 500;

/** Max iframe height / flexible maxWidth defaults (SEP containerDimensions). */
const FLEX_MAX_HEIGHT = 1200;
const FALLBACK_MAX_WIDTH = 4096;

const BASE_HOST_CAPABILITIES = {
  openLinks: {},
  downloadFile: {},
  serverTools: {},
  serverResources: {},
  logging: {},
  message: { text: {} },
  updateModelContext: { text: {}, structuredContent: {} },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Send host ui/resource-teardown and wait briefly for a response.
 * AppRendererHandle types teardown as void, but AppBridge returns a Promise.
 */
async function teardownWithTimeout(
  handle: AppRendererHandle | null | undefined,
  timeoutMs = TEARDOWN_TIMEOUT_MS,
): Promise<void> {
  if (!handle) return;
  try {
    const pending = handle.teardownResource() as unknown as Promise<unknown> | void;
    await Promise.race([Promise.resolve(pending), sleep(timeoutMs)]);
  } catch (err) {
    console.warn("[McpAppHost] teardownResource failed:", err);
  }
}

function toCallToolResult(
  result:
    | {
        content?: unknown;
        structuredContent?: unknown;
        isError?: boolean;
        _meta?: unknown;
      }
    | null
    | undefined,
): CallToolResult | undefined {
  if (!result) return undefined;
  const content = Array.isArray(result.content)
    ? (result.content as CallToolResult["content"])
    : [];
  // CallToolResultSchema rejects structuredContent: null; omit empty/null fields
  // so AppFrame.sendToolResult() validation does not drop the notification.
  const out: CallToolResult = {
    content,
    isError: Boolean(result.isError),
  };
  if (
    result.structuredContent &&
    typeof result.structuredContent === "object" &&
    !Array.isArray(result.structuredContent)
  ) {
    out.structuredContent = result.structuredContent as Record<string, unknown>;
  }
  const meta = result._meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    out._meta = meta as CallToolResult["_meta"];
  }
  return out;
}

async function fetchToolInputSchema(
  server: string,
  toolName: string,
): Promise<ToolInputSchema | undefined> {
  let cursor: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const data = await listMcpAppTools(server, cursor);
    const tools = Array.isArray(data.tools) ? data.tools : [];
    const match = tools.find((t) => t && typeof t.name === "string" && t.name === toolName);
    const schema = asToolInputSchema(match?.inputSchema);
    if (schema) return schema;
    const next = data.nextCursor;
    if (typeof next !== "string" || !next) return undefined;
    cursor = next;
  }
  return undefined;
}

function filenameFromUri(uri: string, fallback: string): string {
  try {
    const path = uri.split("?")[0] ?? uri;
    const seg = path.split("/").filter(Boolean).pop();
    if (seg && seg !== ".." && !seg.includes("\\")) return seg.slice(0, 180);
  } catch {
    // ignore
  }
  return fallback;
}

/** Browser-local user consent for host side-effects (open link / download). */
function confirmHostAction(message: string): boolean {
  return window.confirm(message);
}

function summarizeDownloadContents(contents: Array<Record<string, unknown>>): string {
  const names = contents.map((item, index) => {
    if (item?.type === "resource" && item.resource && typeof item.resource === "object") {
      const resource = item.resource as { uri?: string };
      return filenameFromUri(resource.uri || "", `file ${index + 1}`);
    }
    if (item?.type === "resource_link" && typeof item.name === "string" && item.name) {
      return item.name;
    }
    if (typeof item?.uri === "string" && item.uri) {
      return filenameFromUri(item.uri, `file ${index + 1}`);
    }
    return `file ${index + 1}`;
  });
  return names.join("\n");
}

/** Trigger a browser download for embedded text/blob content (ui/download-file). */
function downloadEmbeddedResource(resource: {
  uri?: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}): void {
  const mime = resource.mimeType || "application/octet-stream";
  const name = filenameFromUri(resource.uri || "", "download");
  let blob: Blob;
  if (typeof resource.text === "string") {
    blob = new Blob([resource.text], { type: mime });
  } else if (typeof resource.blob === "string") {
    let binary: string;
    try {
      binary = atob(resource.blob);
    } catch {
      throw new McpError(ErrorCode.InvalidParams, "download blob is not valid base64");
    }
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    blob = new Blob([bytes], { type: mime });
  } else {
    throw new McpError(ErrorCode.InvalidParams, "download content missing text/blob");
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Defer revoke so navigation/download can start before the object URL is invalidated.
  queueMicrotask(() => URL.revokeObjectURL(url));
}

/**
 * Spec-oriented MCP Apps host renderer for a single tool_call that carries mcpApp.
 * Uses @mcp-ui/client AppRenderer + BFF proxy (never talks to MCP servers from the browser).
 */
export function McpAppHost({
  mcpApp,
  toolName,
  toolCancelled = false,
  className,
}: McpAppHostProps) {
  const theme = useSelector(selectTheme);
  const chatActions = useChatActions();
  const rootRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<AppRendererHandle>(null);
  const tornDownRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(420);
  const [tornDown, setTornDown] = useState(false);
  const [resourceCsp, setResourceCsp] = useState<McpAppResourceCsp | undefined>();
  const [resourcePermissions, setResourcePermissions] = useState<
    McpAppResourcePermissions | undefined
  >();
  const [resourceHtml, setResourceHtml] = useState<string | undefined>();
  const [cspReady, setCspReady] = useState(false);

  const finishTeardown = useCallback(async () => {
    if (tornDownRef.current) return;
    tornDownRef.current = true;
    await teardownWithTimeout(appRef.current);
    setTornDown(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();
    (async () => {
      // Teardown the previous View (if any) before swapping resource / remounting.
      if (appRef.current && !tornDownRef.current) {
        await teardownWithTimeout(appRef.current);
      }
      if (cancelled) return;
      tornDownRef.current = false;
      setTornDown(false);
      setError(null);
      setHeight(420);
      setCspReady(false);
      setResourceCsp(undefined);
      setResourcePermissions(undefined);
      setResourceHtml(undefined);
      try {
        const data = await readMcpAppResource(mcpApp.server, mcpApp.resourceUri);
        if (cancelled) return;
        const validationError = validateMcpAppResourceRead(mcpApp.resourceUri, data);
        if (validationError) {
          setError(validationError);
          setResourceCsp(undefined);
          setResourcePermissions(undefined);
          setResourceHtml(undefined);
          return;
        }
        // Prefer resources/read _meta.ui; fall back to paginated resources/list.
        let csp: McpAppResourceCsp | undefined;
        let permissions: McpAppResourcePermissions | undefined;
        try {
          const resolved = await resolveCspAndPermissionsWithListFallback(
            mcpApp.resourceUri,
            data,
            (cursor) => listMcpAppResources(mcpApp.server, cursor),
            20,
            abort.signal,
          );
          if (cancelled) return;
          csp = resolved.csp;
          permissions = resolved.permissions;
        } catch (listErr) {
          console.warn(
            "[McpAppHost] resources/list CSP fallback failed:",
            listErr,
          );
          // Still mount with whatever read provided (may be empty → SEP defaults).
          const fallback = resolveCspAndPermissionsFromReadAndList(
            mcpApp.resourceUri,
            data,
          );
          csp = fallback.csp;
          permissions = fallback.permissions;
        }
        if (!cancelled) {
          setResourceCsp(csp);
          setResourcePermissions(permissions);
          setResourceHtml(extractMcpAppHtmlFromResourceRead(data) ?? undefined);
          setCspReady(true);
        }
      } catch (err) {
        console.warn("[McpAppHost] MCP App resource prefetch failed:", err);
        if (!cancelled) {
          setResourceCsp(undefined);
          setResourcePermissions(undefined);
          setResourceHtml(undefined);
          setError(
            err instanceof Error ? err.message : "Failed to load MCP App resource",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
    };
  }, [mcpApp.server, mcpApp.resourceUri]);

  // View sends ui/notifications/request-teardown (notification). AppRenderer does not
  // expose a prop for it; accept when the message originates from our sandbox iframe.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.method !== "ui/notifications/request-teardown") return;
      const root = rootRef.current;
      if (!root) return;
      const frames = root.querySelectorAll("iframe");
      let fromUs = false;
      frames.forEach((frame) => {
        if (frame.contentWindow === event.source) fromUs = true;
      });
      if (!fromUs) return;
      void finishTeardown();
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [finishTeardown]);

  // Host-initiated teardown: AppRenderer closes its bridge in a passive useEffect
  // cleanup (children first). A layout cleanup here still runs while the bridge
  // is open, so we can send ui/resource-teardown before the iframe is destroyed.
  // Do NOT call finishTeardown here — that setTornDown(true) races with React Strict
  // Mode's setup→cleanup→setup and leaves the host stuck on "Interactive UI closed."
  useLayoutEffect(() => {
    return () => {
      if (tornDownRef.current) return;
      tornDownRef.current = true;
      void teardownWithTimeout(appRef.current);
    };
  }, []);

  const sandbox = useMemo(
    () => ({
      url: getMcpAppsSandboxUrl(
        resourcePermissions ? { permissions: resourcePermissions } : undefined,
      ),
      ...(resourceCsp ? { csp: resourceCsp } : {}),
    }),
    [resourceCsp, resourcePermissions],
  );

  const hostCapabilities = useMemo(() => {
    if (!resourceCsp && !resourcePermissions) {
      return BASE_HOST_CAPABILITIES;
    }
    return {
      ...BASE_HOST_CAPABILITIES,
      sandbox: {
        ...(resourceCsp ? { csp: resourceCsp } : {}),
        ...(resourcePermissions ? { permissions: resourcePermissions } : {}),
      },
    };
  }, [resourceCsp, resourcePermissions]);

  const resolvedToolName = mcpApp.toolName || toolName;
  // AppFrame only sends tool-result when toolResult is truthy; omit fakes when cancelled/missing.
  const toolResult = useMemo(() => toCallToolResult(mcpApp.result), [mcpApp.result]);
  const toolInput = mcpApp.arguments ?? {};
  const [containerWidth, setContainerWidth] = useState<number | undefined>();
  const [inputSchema, setInputSchema] = useState<ToolInputSchema>(DEFAULT_INPUT_SCHEMA);
  const maxWidth = containerWidth ?? FALLBACK_MAX_WIDTH;

  // Measure host box so Views can size from containerDimensions (SEP SHOULD).
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (typeof width === "number" && width > 0) {
        setContainerWidth(Math.round(width));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cspReady, tornDown]);

  useEffect(() => {
    let cancelled = false;
    setInputSchema(DEFAULT_INPUT_SCHEMA);
    (async () => {
      try {
        const schema = await fetchToolInputSchema(mcpApp.server, resolvedToolName);
        if (!cancelled && schema) setInputSchema(schema);
      } catch (err) {
        console.warn("[McpAppHost] tools/list for inputSchema failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mcpApp.server, resolvedToolName]);

  const hostContext = useMemo(() => {
    const locale =
      typeof navigator !== "undefined" && typeof navigator.language === "string"
        ? navigator.language
        : undefined;
    let timeZone: string | undefined;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      timeZone = undefined;
    }

    return {
      theme: theme === "light" ? ("light" as const) : ("dark" as const),
      platform: "web" as const,
      displayMode: "inline" as const,
      // Only advertise modes we actually implement (no fullscreen / PiP yet).
      availableDisplayModes: ["inline" as const],
      // Flexible axes so Views can drive size via size-changed (SEP MUST).
      containerDimensions: {
        maxWidth,
        maxHeight: FLEX_MAX_HEIGHT,
      },
      locale,
      timeZone,
      userAgent: `${HOST_INFO.name}/${HOST_INFO.version}`,
      toolInfo: {
        tool: {
          name: resolvedToolName,
          inputSchema,
        },
      },
    };
  }, [theme, maxWidth, resolvedToolName, inputSchema]);

  const onReadResource = useCallback(
    async (params: { uri: string }): Promise<ReadResourceResult> => {
      const data = await readMcpAppResource(mcpApp.server, params.uri);
      // Fail closed for ui:// so AppRenderer retry cannot bypass HTML/MIME checks.
      if (typeof params.uri === "string" && params.uri.startsWith("ui://")) {
        const validationError = validateMcpAppResourceRead(params.uri, data);
        if (validationError) {
          throw new McpError(ErrorCode.InvalidParams, validationError);
        }
      }
      return {
        contents: (data.contents ?? []) as ReadResourceResult["contents"],
      };
    },
    [mcpApp.server],
  );

  const onListResources = useCallback(
    async (params?: { cursor?: string }): Promise<ListResourcesResult> => {
      // MCP ListResourcesRequest.params is optional; Views often call with no args.
      const data = await listMcpAppResources(mcpApp.server, params?.cursor);
      return {
        resources: (data.resources ?? []) as ListResourcesResult["resources"],
        nextCursor: data.nextCursor,
      };
    },
    [mcpApp.server],
  );

  const onListResourceTemplates = useCallback(
    async (params?: { cursor?: string }): Promise<ListResourceTemplatesResult> => {
      const data = await listMcpAppResourceTemplates(mcpApp.server, params?.cursor);
      return {
        resourceTemplates: (data.resourceTemplates ??
          []) as ListResourceTemplatesResult["resourceTemplates"],
        nextCursor: data.nextCursor,
      };
    },
    [mcpApp.server],
  );

  const onCallTool = useCallback(
    async (params: {
      name: string;
      arguments?: Record<string, unknown>;
    }): Promise<CallToolResult> => {
      const data = await callMcpAppTool(
        mcpApp.server,
        params.name,
        params.arguments ?? {},
      );
      return (
        toCallToolResult({
          content: data.content,
          structuredContent: data.structuredContent,
          isError: data.isError,
          _meta: data._meta,
        }) ?? { content: [], isError: Boolean(data.isError) }
      );
    },
    [mcpApp.server],
  );

  const onOpenLink = useCallback(async (params: { url: string }) => {
    try {
      // Absolute URL only — a base would turn junk like "not a valid url ://???"
      // into a same-origin relative http: link.
      const url = new URL(params.url);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        return { isError: true };
      }
      if (!confirmHostAction(`Open this link?\n\n${url.href}`)) {
        return { isError: true };
      }
      window.open(url.href, "_blank", "noopener,noreferrer");
      return {};
    } catch {
      return { isError: true };
    }
  }, []);

  const onSizeChanged = useCallback((params: { height?: number; width?: number }) => {
    if (typeof params.height === "number" && params.height > 0) {
      setHeight(Math.min(Math.max(params.height, 120), FLEX_MAX_HEIGHT));
    }
    // AppFrame sets iframe.style.width to the View's px after calling this handler.
    // Keep the iframe fluid so the App can grow again when the chat column widens.
    queueMicrotask(() => {
      const iframe = rootRef.current?.querySelector("iframe");
      if (iframe) iframe.style.width = "100%";
    });
  }, []);

  const onError = useCallback((err: Error) => {
    console.error("[McpAppHost]", err);
    setError(err.message || "Failed to render MCP App");
  }, []);

  const onLoggingMessage = useCallback(
    (params: { level?: string; logger?: string; data?: unknown }) => {
      const level = typeof params.level === "string" ? params.level : "info";
      const loggerName = typeof params.logger === "string" ? params.logger : "";
      const prefix = loggerName
        ? `[MCP App:${mcpApp.server}:${loggerName}]`
        : `[MCP App:${mcpApp.server}]`;
      const payload = params.data;
      if (level === "error" || level === "critical") {
        console.error(prefix, payload);
      } else if (level === "warning" || level === "warn") {
        console.warn(prefix, payload);
      } else if (level === "debug") {
        console.debug(prefix, payload);
      } else {
        console.info(prefix, payload);
      }
    },
    [mcpApp.server],
  );

  const onMessage = useCallback(
    async (params: { role: string; content: unknown[] }) => {
      if (!chatActions) {
        console.warn("[McpAppHost] ui/message ignored — ChatActions not available");
        return { isError: true };
      }
      if (params.role !== "user") {
        return { isError: true };
      }
      const text = extractTextFromContentBlocks(params.content);
      if (!text) {
        return { isError: true };
      }
      try {
        await chatActions.sendUserMessage(text);
        return {};
      } catch (err) {
        console.error("[McpAppHost] ui/message failed:", err);
        return { isError: true };
      }
    },
    [chatActions],
  );

  const onFallbackRequest = useCallback(
    async (request: JSONRPCRequest) => {
      if (request.method === "ui/update-model-context") {
        if (!chatActions) {
          console.warn(
            "[McpAppHost] ui/update-model-context ignored — ChatActions not available",
          );
          throw new McpError(ErrorCode.InternalError, "Host chat actions unavailable");
        }
        const params = (request.params ?? {}) as {
          content?: unknown[];
          structuredContent?: Record<string, unknown>;
        };
        chatActions.setMcpModelContext({
          content: params.content,
          structuredContent: params.structuredContent,
        });
        return {};
      }

      if (request.method === "ui/download-file") {
        const params = (request.params ?? {}) as {
          contents?: Array<Record<string, unknown>>;
        };
        const contents = Array.isArray(params.contents) ? params.contents : [];
        if (contents.length === 0) {
          throw new McpError(ErrorCode.InvalidParams, "download contents required");
        }
        const summary = summarizeDownloadContents(contents);
        if (
          !confirmHostAction(
            `Download file${contents.length === 1 ? "" : "s"} from this app?\n\n${summary}`,
          )
        ) {
          // Soft deny — same contract as ui/open-link (bench expects isError, not -32600).
          return { isError: true };
        }
        for (const item of contents) {
          if (item?.type === "resource" && item.resource && typeof item.resource === "object") {
            downloadEmbeddedResource(
              item.resource as {
                uri?: string;
                mimeType?: string;
                text?: string;
                blob?: string;
              },
            );
            continue;
          }
          if (item?.type === "resource_link" && typeof item.uri === "string" && item.uri) {
            const data = await readMcpAppResource(mcpApp.server, item.uri);
            const resource = data.contents?.[0];
            if (!resource || typeof resource !== "object") {
              throw new McpError(
                ErrorCode.InvalidParams,
                `resource_link read returned no contents for ${item.uri}`,
              );
            }
            downloadEmbeddedResource({
              uri: typeof resource.uri === "string" ? resource.uri : item.uri,
              mimeType: typeof resource.mimeType === "string" ? resource.mimeType : undefined,
              text: typeof resource.text === "string" ? resource.text : undefined,
              blob: typeof resource.blob === "string" ? resource.blob : undefined,
            });
            continue;
          }
          throw new McpError(
            ErrorCode.InvalidParams,
            "Unsupported download content type (expected resource or resource_link)",
          );
        }
        return {};
      }

      // Only inline is implemented; still answer so Views do not get MethodNotFound.
      if (request.method === "ui/request-display-mode") {
        return { mode: "inline" as const };
      }

      if (request.method === "tools/list") {
        const cursor = (request.params as { cursor?: string } | undefined)?.cursor;
        const data = await listMcpAppTools(mcpApp.server, cursor);
        return {
          tools: data.tools ?? [],
          ...(typeof data.nextCursor === "string" && data.nextCursor
            ? { nextCursor: data.nextCursor }
            : {}),
        };
      }

      throw new McpError(ErrorCode.MethodNotFound, `No handler for method: ${request.method}`);
    },
    [chatActions, mcpApp.server],
  );

  return (
    <div
      ref={rootRef}
      className={className}
      data-testid="mcp-app-host"
      data-mcp-server={mcpApp.server}
      data-mcp-resource={mcpApp.resourceUri}
    >
      {error ? (
        <div
          role="alert"
          className="text-xs text-destructive bg-muted border border-border rounded-lg p-3"
        >
          MCP App failed to load: {error}
        </div>
      ) : tornDown ? (
        <div className="text-xs text-muted-foreground p-3">Interactive UI closed.</div>
      ) : !cspReady ? (
        <div className="text-xs text-muted-foreground p-3">Loading interactive UI…</div>
      ) : (
        <div
          style={{
            width: "100%",
            maxWidth,
            height,
            minHeight: 120,
          }}
          className="overflow-hidden"
        >
          <AppRenderer
            ref={appRef}
            toolName={resolvedToolName}
            toolResourceUri={mcpApp.resourceUri}
            html={resourceHtml}
            sandbox={sandbox}
            toolInput={toolInput}
            toolResult={toolResult}
            toolCancelled={Boolean(toolCancelled && !toolResult)}
            hostContext={hostContext}
            hostInfo={HOST_INFO}
            hostCapabilities={hostCapabilities}
            onReadResource={onReadResource}
            onListResources={onListResources}
            onListResourceTemplates={onListResourceTemplates}
            onCallTool={onCallTool}
            onOpenLink={onOpenLink}
            onMessage={onMessage}
            onLoggingMessage={onLoggingMessage}
            onFallbackRequest={onFallbackRequest}
            onSizeChanged={onSizeChanged}
            onError={onError}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Gate + parse wrapper used by chat tool-call rendering.
 * Returns null when Apps are disabled or the descriptor is invalid.
 */
export function McpAppHostFromToolCall({
  mcpAppRaw,
  toolName,
  toolCancelled,
  className,
}: {
  mcpAppRaw: unknown;
  toolName: string;
  /** Tool call settled without an mcpApp.result (e.g. stream abort). */
  toolCancelled?: boolean;
  className?: string;
}) {
  const features = useSelector((state: RootState) => state.config.features);
  const enabled = features?.mcp_apps_enabled === true;
  const mcpApp = enabled ? parseMcpApp(mcpAppRaw) : null;
  if (!mcpApp) return null;
  return (
    <McpAppHost
      mcpApp={mcpApp}
      toolName={toolName}
      toolCancelled={toolCancelled}
      className={className}
    />
  );
}
