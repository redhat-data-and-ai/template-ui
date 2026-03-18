import type {
  DeepResearchAdapter,
  DRRequestParams,
  DRStreamHandle,
  NormalizedChunk,
  AdapterFeatures,
} from "../types";
import { parseSSEChunk } from "../shared/sse";
import { stringifyVar, extractTextFromBlock, makeDRChunk, makeErrorChunk } from "../shared/events";
import { fetchWithTimeout, REQUEST_TIMEOUT_MS } from "../shared/fetch";

interface LangGraphOptions {
  assistantId: string;
  streamMode?: string[];
  reportStateField?: string;
  configurable?: Record<string, unknown>;
}

function extractLangChainContent(msg: Record<string, unknown>): string {
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map(extractTextFromBlock).join("\n");
  return stringifyVar(content);
}

const SUMMARY_MAX_LEN = 200;

function summariseAiMessage(msg: Record<string, unknown>, nodeName: string): string | null {
  const toolCalls = (msg.tool_calls as { name?: string }[]) ?? [];
  if (toolCalls.length > 0) {
    const names = toolCalls.map((tc) => tc.name ?? "?").join(", ");
    return `[${nodeName}] Calling: ${names}`;
  }
  const text = extractLangChainContent(msg).trim();
  if (!text) return null;
  const truncated = text.length > SUMMARY_MAX_LEN
    ? `${text.slice(0, SUMMARY_MAX_LEN)}...`
    : text;
  return `[${nodeName}] ${truncated}`;
}

function summariseMessage(msg: Record<string, unknown>, nodeName: string): string | null {
  if (typeof msg !== "object" || msg === null) return null;
  const msgType = (msg.type as string) ?? "";
  if (msgType === "ai") return summariseAiMessage(msg, nodeName);
  if (msgType === "tool") {
    const name = (msg.name as string) ?? "tool";
    const text = extractLangChainContent(msg).trim();
    return text ? `[${name}] ${text.slice(0, 200)}` : null;
  }
  return null;
}

function toMessageArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value as Record<string, unknown>[];
  return [];
}

export function summariseLangGraphNode(
  nodeName: string,
  nodeData: Record<string, unknown>,
): string | null {
  if (nodeName === "__start__" || nodeName === "__end__") return null;

  const messages = toMessageArray(nodeData.messages).length > 0
    ? toMessageArray(nodeData.messages)
    : toMessageArray(nodeData.supervisor_messages);

  for (const msg of messages) {
    const summary = summariseMessage(msg, nodeName);
    if (summary) return summary;
  }

  if (nodeName === "write_research_brief") {
    const brief = nodeData.research_brief as string | undefined;
    if (brief) return `Research brief: ${brief.slice(0, 200)}`;
  }

  return `Running: ${nodeName}`;
}

function coerceReportToString(report: unknown): string {
  if (typeof report === "string") return report;
  if (Array.isArray(report)) return (report as unknown[]).map(extractTextFromBlock).join("\n");
  return stringifyVar(report);
}

function extractReportChunk(
  nodeData: Record<string, unknown>,
  reportField: string,
): NormalizedChunk | null {
  const report = nodeData[reportField];
  if (report == null) return null;
  const text = coerceReportToString(report).trim();
  if (!text) return null;
  return makeDRChunk("complete", "final_answer", text, "final_report");
}

const MIN_FINAL_ANSWER_LENGTH = 200;

function extractFinalAiAnswer(
  nodeData: Record<string, unknown>,
): NormalizedChunk | null {
  const messages = toMessageArray(nodeData.messages);
  if (messages.length === 0) return null;

  const lastMsg = messages.at(-1);
  if (typeof lastMsg !== "object" || lastMsg === null) return null;
  if ((lastMsg.type as string) !== "ai") return null;

  const toolCalls = lastMsg.tool_calls as unknown[] | undefined;
  if (toolCalls && toolCalls.length > 0) return null;

  const content = extractLangChainContent(lastMsg).trim();
  if (content.length < MIN_FINAL_ANSWER_LENGTH) return null;

  return makeDRChunk("complete", "final_answer", content, "final_report");
}

export async function detect(backendUrl: string): Promise<DeepResearchAdapter | null> {
  try {
    const infoResp = await fetchWithTimeout(`${backendUrl}/info`);
    if (!infoResp.ok) return null;
    const info = (await infoResp.json()) as { version?: string };
    if (!info.version) return null;

    const assistantsResp = await fetchWithTimeout(`${backendUrl}/assistants/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 10 }),
    });
    if (!assistantsResp.ok) {
      throw new Error(`LangGraph detected but assistants search failed: ${assistantsResp.status}`);
    }
    const assistants = (await assistantsResp.json()) as {
      assistant_id: string;
      name: string | null;
      graph_id: string;
    }[];
    if (assistants.length === 0) {
      throw new Error("LangGraph detected but no assistants found");
    }

    const assistant = assistants[0];
    const adapterName = assistant.name ?? assistant.graph_id ?? "langgraph";

    console.info(
      `Auto-detected LangGraph server at ${backendUrl} (assistant: ${assistant.assistant_id})`,
    );

    return new LangGraphAdapter(backendUrl, adapterName, {
      assistantId: assistant.assistant_id,
      streamMode: ["updates"],
      reportStateField: "final_report",
    });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("LangGraph detected")) throw err;
    return null;
  }
}

export class LangGraphAdapter implements DeepResearchAdapter {
  readonly name: string;
  readonly features: AdapterFeatures = {
    planApproval: false,
    steering: false,
    modelSelection: false,
  };

  private readonly baseUrl: string;
  private readonly options: LangGraphOptions;

  constructor(baseUrl: string, name: string, options: LangGraphOptions) {
    this.baseUrl = baseUrl;
    this.name = name;
    this.options = options;
  }

  async startResearch(params: DRRequestParams): Promise<DRStreamHandle> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const fetchOpts = (body: unknown): RequestInit => ({
      method: "POST",
      headers,
      body: JSON.stringify(body),
      ...(params.signal ? { signal: params.signal } : {}),
    });

    const threadResp = await fetchWithTimeout(
      `${this.baseUrl}/threads`,
      fetchOpts({}),
      REQUEST_TIMEOUT_MS,
    );
    if (!threadResp.ok) {
      const detail = await threadResp.text().catch(() => "");
      throw new Error(`${this.name} thread creation failed: ${threadResp.status} ${detail}`.trim());
    }
    const { thread_id } = (await threadResp.json()) as { thread_id: string };

    const runBody = {
      assistant_id: this.options.assistantId,
      input: { messages: [{ role: "human", content: params.message }] },
      stream_mode: this.options.streamMode ?? ["updates"],
      config: {
        configurable: { allow_clarification: false, ...this.options.configurable },
      },
    };

    const streamResp = await fetchWithTimeout(
      `${this.baseUrl}/threads/${thread_id}/runs/stream`,
      fetchOpts(runBody),
      REQUEST_TIMEOUT_MS,
    );
    if (!streamResp.ok) {
      const detail = await streamResp.text().catch(() => "");
      throw new Error(`${this.name} run stream failed: ${streamResp.status} ${detail}`.trim());
    }

    const reader = streamResp.body?.getReader();
    if (!reader) throw new Error("Failed to get reader from LangGraph stream");
    return { reader, streamId: thread_id };
  }

  async cancelResearch(threadId: string, token?: string): Promise<void> {
    if (!threadId) return;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["X-Token"] = token;

    await fetchWithTimeout(`${this.baseUrl}/threads/${threadId}/runs/cancel`, {
      method: "POST",
      headers,
    }).catch((err: unknown) => console.warn(`${this.name} cancel failed:`, err));
  }

  normalizeChunk(rawLine: string): NormalizedChunk | NormalizedChunk[] | null {
    const trimmed = rawLine.trim();
    if (!trimmed) return null;

    const { dataStr, eventType } = parseSSEChunk(trimmed);

    if (eventType === "metadata") {
      return makeDRChunk("triage", "started", "Starting research...");
    }

    if (eventType === "error") {
      const errorMsg = dataStr || "LangGraph run failed";
      try {
        const parsed = JSON.parse(errorMsg) as Record<string, unknown>;
        const message = (parsed.message as string) ?? (parsed.error as string) ?? errorMsg;
        return makeErrorChunk(message);
      } catch {
        return makeErrorChunk(errorMsg);
      }
    }

    if (!dataStr || eventType !== "updates") return null;

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(dataStr) as Record<string, unknown>;
    } catch {
      return null;
    }

    const reportField = this.options.reportStateField ?? "final_report";
    const chunks: NormalizedChunk[] = [];

    for (const [nodeName, rawNodeData] of Object.entries(payload)) {
      if (rawNodeData == null || typeof rawNodeData !== "object") continue;
      const nodeData = rawNodeData as Record<string, unknown>;

      const reportChunk = extractReportChunk(nodeData, reportField);
      if (reportChunk) return reportChunk;

      const finalAnswer = extractFinalAiAnswer(nodeData);
      if (finalAnswer) return finalAnswer;

      const activity = summariseLangGraphNode(nodeName, nodeData);
      if (activity) chunks.push(makeDRChunk("research", "activity", activity, nodeName));
    }

    if (chunks.length === 0) return null;
    if (chunks.length === 1) return chunks[0];
    return chunks;
  }
}
