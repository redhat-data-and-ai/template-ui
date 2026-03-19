import type { DeepResearchEvent } from "../../../types/chat";
import type {
  DeepResearchAdapter,
  DRRequestParams,
  DRStreamHandle,
  NormalizedChunk,
  PlanApprovalParams,
  AdapterFeatures,
} from "../types";
import type { AdapterConfigSchema, EndpointConfig, EventMappingEntry } from "../config-types";
import { parseSSEChunk } from "../shared/sse";
import { stringifyVar, getNestedValue, buildDefaultEvent, makeErrorChunk } from "../shared/events";
import { fetchWithTimeout, REQUEST_TIMEOUT_MS } from "../shared/fetch";
import { getAdapterConfig } from "../../../config";

type BodyMappingValue = string | boolean | number | Record<string, unknown>;

function resolveTemplate(template: string, vars: Record<string, unknown>): string {
  return template.replaceAll(
    /\{\{(\w+)\}\}/g,
    (_, key: string) => encodeURIComponent(stringifyVar(vars[key])),
  );
}

function buildRequestBody(
  mapping: Record<string, BodyMappingValue>,
  vars: Record<string, unknown>,
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (typeof value === "string" && value.startsWith("{{") && value.endsWith("}}")) {
      const varName = value.slice(2, -2);
      body[key] = vars[varName] ?? "";
    } else if (typeof value === "object" && value !== null) {
      body[key] = buildRequestBody(
        value as Record<string, BodyMappingValue>,
        vars,
      );
    } else {
      body[key] = value;
    }
  }
  return body;
}

function buildMappedEvent(
  mapping: EventMappingEntry,
  data: Record<string, unknown>,
  timestamp: string,
  fullEvent: Record<string, unknown>,
): NormalizedChunk {
  const message = stringifyVar(getNestedValue(fullEvent, mapping.messageField));
  const displayText = mapping.displayTextField
    ? stringifyVar(getNestedValue(fullEvent, mapping.displayTextField)) || message
    : message;

  const drEvent: DeepResearchEvent = {
    stage: mapping.stage,
    event_type: mapping.eventType,
    message,
    display_text: displayText,
    log_entry: message,
    ui_visible: mapping.uiVisible !== false,
    details: { ...data },
    timestamp,
  };

  if (mapping.reportField) {
    drEvent.details.report = stringifyVar(getNestedValue(fullEvent, mapping.reportField));
  }

  if (mapping.eventType === "error") {
    return makeErrorChunk(message);
  }

  return { type: "deep_research_status", content: drEvent };
}

function mapEventWithConfig(
  parsed: Record<string, unknown>,
  config: AdapterConfigSchema,
): NormalizedChunk | null {
  const eventTypeField = config.eventTypeField ?? "event_type";
  const dataField = config.dataField ?? "data";
  const timestampField = config.timestampField ?? "timestamp";

  const backendEventType = (parsed[eventTypeField] as string) ?? "";
  const data = (parsed[dataField] as Record<string, unknown>) ?? parsed;
  const timestamp = (parsed[timestampField] as string) ?? new Date().toISOString();

  if (!config.eventMapping) {
    return buildDefaultEvent(backendEventType, data, timestamp);
  }

  const mapping = config.eventMapping[backendEventType];
  if (mapping === "ignore") return null;
  if (!mapping) return buildDefaultEvent(backendEventType, data, timestamp);

  return buildMappedEvent(mapping, data, timestamp, parsed);
}

function isValidEndpoint(raw: unknown): raw is EndpointConfig {
  if (raw == null || typeof raw !== "object") return false;
  const ep = raw as Record<string, unknown>;
  if (typeof ep.path !== "string" || !ep.path.startsWith('/')) return false;
  if (!ep.method || !VALID_METHODS.has(ep.method as string)) return false;
  return true;
}

export function isValidConfig(config: unknown): config is AdapterConfigSchema {
  if (config == null || typeof config !== "object") return false;
  const c = config as Record<string, unknown>;
  if (typeof c.name !== "string") return false;
  if (!c.features || typeof c.features !== "object") return false;

  const ep = c.endpoints as Record<string, unknown> | undefined;
  if (!ep || typeof ep !== "object") return false;
  if (!isValidEndpoint(ep.start)) return false;
  if (!isValidEndpoint(ep.cancel)) return false;

  const stream = c.stream as Record<string, unknown> | undefined;
  if (!stream || typeof stream !== "object") return false;
  if (!stream.chunkFormat || !stream.mode) return false;

  return true;
}

const VALID_CHUNK_TYPES = new Set(["deep_research_status", "token", "message", "error"]);
const VALID_METHODS = new Set(["GET", "POST", "PUT", "DELETE"]);
const RESEARCH_PATH_KEYWORDS = /research|stream|agent|deep.?research/i;
const CANCEL_PATH_KEYWORDS = /cancel|stop|abort/i;

const DEFAULT_BODY_MAPPING: Record<string, string> = {
  message: "{{message}}",
  thread_id: "{{threadId}}",
  session_id: "{{sessionId}}",
  user_id: "{{userId}}",
};

function parseOpenApiSpec(spec: Record<string, unknown>): AdapterConfigSchema | null {
  const paths = spec.paths as Record<string, Record<string, unknown>> | undefined;
  if (!paths) return null;

  let startPath: string | null = null;
  let cancelPath: string | null = null;

  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== "object") continue;
    if (!methods.post) continue;

    if (!startPath && RESEARCH_PATH_KEYWORDS.test(path)) {
      startPath = path;
    }
    if (!cancelPath && CANCEL_PATH_KEYWORDS.test(path)) {
      cancelPath = path;
    }
  }

  if (!startPath) return null;

  const title = (spec.info as Record<string, unknown> | undefined)?.title as string | undefined;

  return {
    name: title ?? "api-probe",
    features: { planApproval: false, steering: false, modelSelection: false },
    endpoints: {
      start: {
        path: startPath,
        method: "POST",
        bodyMapping: { ...DEFAULT_BODY_MAPPING },
      },
      cancel: { path: cancelPath ?? "/v1/cancel", method: "POST" },
    },
    stream: { mode: "direct", chunkFormat: "passthrough" },
  };
}

async function probeWellKnown(backendUrl: string): Promise<AdapterConfigSchema | null> {
  try {
    const resp = await fetchWithTimeout(`${backendUrl}/.well-known/deep-research`);
    if (!resp.ok) return null;
    const config = (await resp.json()) as unknown;
    if (!isValidConfig(config)) return null;
    return config;
  } catch {
    return null;
  }
}

async function probeOpenApi(backendUrl: string): Promise<AdapterConfigSchema | null> {
  try {
    const resp = await fetchWithTimeout(`${backendUrl}/openapi.json`);
    if (!resp.ok) return null;
    const spec = (await resp.json()) as Record<string, unknown>;
    return parseOpenApiSpec(spec);
  } catch {
    return null;
  }
}

async function probeHealth(backendUrl: string): Promise<boolean> {
  for (const path of ["/health", "/"]) {
    try {
      const resp = await fetchWithTimeout(`${backendUrl}${path}`);
      if (resp.ok) return true;
    } catch {
      /* try next */
    }
  }
  return false;
}

function buildFallbackConfig(): AdapterConfigSchema {
  return {
    name: "api-probe",
    features: { planApproval: false, steering: false, modelSelection: false },
    endpoints: {
      start: {
        path: "/v1/stream",
        method: "POST",
        bodyMapping: { ...DEFAULT_BODY_MAPPING },
      },
      cancel: { path: "/v1/cancel", method: "POST" },
    },
    stream: { mode: "direct", chunkFormat: "passthrough" },
  };
}

export async function detect(backendUrl: string): Promise<DeepResearchAdapter | null> {
  const envConfig = getAdapterConfig();
  if (envConfig !== null) {
    if (isValidConfig(envConfig)) {
      console.info("Using adapter config from VITE_ADAPTER_CONFIG");
      return new ApiProbeAdapter(backendUrl, envConfig);
    }
    console.warn("VITE_ADAPTER_CONFIG is set but invalid, falling back to API probing.");
  }

  const wellKnownConfig = await probeWellKnown(backendUrl);
  if (wellKnownConfig) {
    console.info(`Auto-detected API at ${backendUrl} via .well-known/deep-research`);
    return new ApiProbeAdapter(backendUrl, wellKnownConfig);
  }

  const openApiConfig = await probeOpenApi(backendUrl);
  if (openApiConfig) {
    console.info(`Auto-detected API at ${backendUrl} via OpenAPI spec`);
    return new ApiProbeAdapter(backendUrl, openApiConfig);
  }

  const alive = await probeHealth(backendUrl);
  if (!alive) return null;

  console.warn(
    `Backend at ${backendUrl} is reachable but API was not auto-detected. ` +
    `Using default streaming config. Set VITE_ADAPTER_CONFIG for custom backends.`,
  );
  return new ApiProbeAdapter(backendUrl, buildFallbackConfig());
}

export class ApiProbeAdapter implements DeepResearchAdapter {
  readonly name: string;
  readonly features: AdapterFeatures;

  private readonly baseUrl: string;
  private readonly config: AdapterConfigSchema;

  constructor(baseUrl: string, config: AdapterConfigSchema) {
    this.baseUrl = baseUrl;
    this.config = config;
    this.name = config.name;
    this.features = { ...config.features };
  }

  private templateVars(params: DRRequestParams): Record<string, unknown> {
    return {
      message: params.message,
      threadId: params.threadId,
      sessionId: params.sessionId,
      userId: params.userId,
    };
  }

  private async executeEndpoint(
    endpoint: EndpointConfig,
    vars: Record<string, unknown>,
    token?: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const url = `${this.baseUrl}${resolveTemplate(endpoint.path, vars)}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["X-Token"] = token;

    const init: RequestInit = { method: endpoint.method, headers };
    if (signal) init.signal = signal;

    if (endpoint.bodyMapping && endpoint.method !== "GET" && endpoint.method !== "DELETE") {
      init.body = JSON.stringify(buildRequestBody(endpoint.bodyMapping, vars));
    }

    const response = await fetchWithTimeout(url, init, REQUEST_TIMEOUT_MS);
    if (!response.ok) {
      throw new Error(`${this.name} HTTP error: ${response.status}`);
    }
    return response;
  }

  async startResearch(params: DRRequestParams): Promise<DRStreamHandle> {
    const vars = this.templateVars(params);
    const response = await this.executeEndpoint(
      this.config.endpoints.start, vars, params.token, params.signal,
    );

    if (this.config.stream.mode === "two-step") {
      const result = (await response.json()) as Record<string, unknown>;
      const urlField = this.config.stream.streamUrlField ?? "stream_url";
      const streamUrl = result[urlField] as string | undefined;
      if (!streamUrl) {
        throw new Error(`No ${urlField} in response from ${this.name}`);
      }

      const streamId = streamUrl.split("/").pop() ?? streamUrl;

      const fullStreamUrl = /^https?:\/\//i.test(streamUrl)
        ? streamUrl
        : `${this.baseUrl}${streamUrl}`;

      const fetchInit: RequestInit = {};
      if (params.signal) fetchInit.signal = params.signal;
      if (params.token) fetchInit.headers = { "X-Token": params.token };

      const sseResponse = await fetch(fullStreamUrl, fetchInit);
      if (!sseResponse.ok) {
        throw new Error(`${this.name} stream error: ${sseResponse.status}`);
      }

      const reader = sseResponse.body?.getReader();
      if (!reader) throw new Error("Failed to get reader from stream");
      return { reader, streamId };
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Failed to get reader from response");
    return { reader };
  }

  async cancelResearch(threadId: string, token?: string): Promise<void> {
    const vars: Record<string, unknown> = {
      threadId,
      sessionId: threadId,
      userId: "",
      message: "",
    };
    await this.executeEndpoint(this.config.endpoints.cancel, vars, token)
      .catch((err: unknown) => console.warn(`${this.name} cancel failed:`, err));
  }

  normalizeChunk(rawLine: string): NormalizedChunk | NormalizedChunk[] | null {
    const trimmed = rawLine.trim();
    if (!trimmed) return null;

    if (this.config.stream.chunkFormat === "passthrough") {
      return this.parsePassthrough(trimmed);
    }

    return this.parseSSE(trimmed);
  }

  private parsePassthrough(trimmed: string): NormalizedChunk | null {
    let jsonData = trimmed;
    if (trimmed.startsWith("data: ")) {
      jsonData = trimmed.slice(6);
    }
    if (jsonData === "[DONE]" || jsonData === "DONE") return null;

    try {
      const parsed = JSON.parse(jsonData) as Record<string, unknown>;
      if (!parsed.type || !VALID_CHUNK_TYPES.has(parsed.type as string)) return null;

      const contentIsObject = typeof parsed.content === "object" && parsed.content !== null;

      if (parsed.type === "deep_research_status" && !contentIsObject) return null;
      if (parsed.type === "error" && !contentIsObject) return null;
      if (parsed.type === "message" && !contentIsObject) return null;
      if (parsed.type === "token" && typeof parsed.content !== "string") return null;

      return parsed as unknown as NormalizedChunk;
    } catch (err) {
      if (import.meta.env.DEV) console.debug("Passthrough parse failed:", err, trimmed);
      return null;
    }
  }

  private parseSSE(trimmed: string): NormalizedChunk | null {
    const { dataStr, eventType } = parseSSEChunk(trimmed);
    if (!dataStr) return null;

    try {
      const parsed = JSON.parse(dataStr) as Record<string, unknown>;
      const etField = this.config.eventTypeField ?? "event_type";
      if (!parsed[etField] && eventType) {
        parsed[etField] = eventType;
      }
      return mapEventWithConfig(parsed, this.config);
    } catch (err) {
      if (import.meta.env.DEV) console.debug("SSE parse failed:", err, dataStr);
      return null;
    }
  }

  async approvePlan(params: PlanApprovalParams): Promise<DRStreamHandle> {
    if (!this.config.endpoints.planApproval) {
      throw new Error(`${this.name} does not support plan approval`);
    }
    const vars: Record<string, unknown> = {
      ...this.templateVars(params),
      plan: params.plan,
    };
    const response = await this.executeEndpoint(
      this.config.endpoints.planApproval, vars, params.token, params.signal,
    );

    const reader = response.body?.getReader();
    if (!reader) throw new Error("Failed to get reader");
    return { reader };
  }

  async sendSteeringMessage(sessionId: string, message: string): Promise<unknown> {
    if (!this.config.endpoints.steering) {
      throw new Error(`${this.name} does not support steering`);
    }
    const vars: Record<string, unknown> = {
      sessionId,
      message,
      threadId: sessionId,
      userId: "",
      streamId: sessionId,
    };
    const response = await this.executeEndpoint(this.config.endpoints.steering, vars);
    return response.json();
  }
}
