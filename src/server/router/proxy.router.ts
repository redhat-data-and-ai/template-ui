import { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getSettings } from '../utils/settings.js';
import authCheckPlugin from '../plugins/auth-check.plugin.js';
import { resolveXUserIdFromSession } from '../utils/session-identity.js';
import { splitMessageParts } from '../message-parts.js';

function getAgentHost(): string {
  const cfg = getSettings();
  return cfg.agent.endpoint || process.env.AGENT_HOST || "http://localhost:5002";
}

/** Identity forwarded to the agent — same as prod: session username, else ``default``. */
function resolveXUserId(request: { session?: { user?: { preferred_username?: string; sub?: string; email?: string }; token?: { access_token?: string; id_token?: string } } }): string {
  return resolveXUserIdFromSession(request.session);
}

/** In-memory LRU cache for thread state responses (avoids repeated LangGraph deserialization). */
const THREAD_STATE_CACHE = new Map<string, { body: string; ts: number }>();
const CACHE_TTL_MS = 3_000; // 3s — short TTL for recovery polling compatibility
const CACHE_MAX_ENTRIES = 50;

function getCachedThreadState(threadId: string): string | null {
  const entry = THREAD_STATE_CACHE.get(threadId);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    THREAD_STATE_CACHE.delete(threadId);
    return null;
  }
  return entry.body;
}

function setCachedThreadState(threadId: string, body: string): void {
  if (THREAD_STATE_CACHE.size >= CACHE_MAX_ENTRIES) {
    const oldest = THREAD_STATE_CACHE.keys().next().value;
    if (oldest) THREAD_STATE_CACHE.delete(oldest);
  }
  THREAD_STATE_CACHE.set(threadId, { body, ts: Date.now() });
}

/** Invalidate cache when a new run completes on a thread. */
export function invalidateThreadStateCache(threadId: string): void {
  THREAD_STATE_CACHE.delete(threadId);
}

interface StreamRequestBody {
  message: string;
  thread_id: string;
  user_id?: string;
  session_id?: string;
  stream_tokens?: boolean;
  resume?: boolean;
  project_id?: string | null;
  requested_subagents?: string[];
}

const SUBAGENT_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function requestedSubagentNames(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !SUBAGENT_NAME.test(item) || seen.has(item)) continue;
    seen.add(item);
    names.push(item);
  }
  return names;
}

/**
 * Extract text from a LangGraph message content field, which may be
 * a plain string OR an array of typed blocks [{type:"text", text:"..."}].
 */
function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((b: any) => {
        if (typeof b === 'string') return b;
        if (b?.type === 'text' && typeof b.text === 'string') return b.text;
        return '';
      })
      .join('');
  }
  return '';
}

/** Answer text for the live stream. A plain string is sent unchanged so a half-written tag is not erased. Block content is split into thought and answer. */
function streamedAnswer(raw: Record<string, any>): string {
  if (typeof raw.content === 'string') return raw.content;
  return splitMessageParts(raw).answer;
}

/**
 * Extract a generic MCP Apps host payload from a LangGraph tool message.
 * Prefer top-level mcpApp (agent serialization), then artifact / kwargs.
 */
function extractMcpApp(msg: Record<string, any>): Record<string, unknown> | undefined {
  const candidates = [
    msg.mcpApp,
    msg.mcp_app,
    msg.artifact?.mcp_app,
    msg.artifact?.mcpApp,
    msg.additional_kwargs?.mcpApp,
    msg.additional_kwargs?.mcp_app,
    msg.response_metadata?.mcpApp,
    msg.response_metadata?.mcp_app,
  ];
  for (const value of candidates) {
    if (value && typeof value === 'object' && typeof (value as any).resourceUri === 'string') {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

function buildToolMessageContent(msg: Record<string, any>): Record<string, unknown> {
  const content: Record<string, unknown> = {
    type: 'tool',
    content: extractText(msg.content) || JSON.stringify(msg.content ?? ''),
    tool_call_id: msg.tool_call_id ?? '',
    name: msg.name ?? 'unknown',
  };
  if (msg.artifact != null) {
    content.artifact = msg.artifact;
  }
  const mcpApp = extractMcpApp(msg);
  if (mcpApp) {
    content.mcpApp = mcpApp;
  }
  return content;
}

/**
 * Translate a LangGraph messages-mode SSE event into the UI chunk format
 * the frontend useDataStream hook expects.
 *
 * `messages/partial` events contain CUMULATIVE content (the full text so far),
 * so we compute the delta against `prevPartial` and return only the new text.
 *
 * Returns [uiChunk | null, updatedPrevPartial].
 */
/**
 * Extract a HITL interrupt payload from a LangGraph `updates` stream event.
 * LangGraph 1.x surfaces interrupts as:
 *   { "__interrupt__": [{ value: HITLInterruptValue, resumable: boolean, ... }] }
 * Returns null when the updates event carries no interrupt.
 */
function extractInterruptFromUpdates(
  payload: unknown,
): { value: unknown; resumable: boolean } | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const p = payload as Record<string, unknown>;
  const interrupts = p.__interrupt__;
  if (!Array.isArray(interrupts) || interrupts.length === 0) return null;
  const first = interrupts[0] as Record<string, unknown>;
  return { value: first.value, resumable: first.resumable !== false };
}

/**
 * Extract tool_calls from a raw message. LangGraph streaming uses
 * `additional_kwargs.function_call` (single) or `tool_calls` (array).
 */
function rewriteSubAgentName(tc: { name: string; args?: Record<string, any> }): string {
  if (tc.name === 'task' && typeof tc.args?.subagent_type === 'string') {
    return tc.args.subagent_type;
  }
  return tc.name;
}

function extractToolCalls(raw: Record<string, any>): { name: string; args: any; id: string }[] {
  if (Array.isArray(raw.tool_calls) && raw.tool_calls.length > 0) {
    return raw.tool_calls.map((tc: any) => ({
      name: rewriteSubAgentName(tc),
      args: tc.args ?? {},
      id: tc.id ?? '',
    }));
  }
  const fc = raw.additional_kwargs?.function_call;
  if (fc && fc.name) {
    let args = {};
    try { args = typeof fc.arguments === 'string' ? JSON.parse(fc.arguments) : fc.arguments ?? {}; } catch { /* ignore */ }
    return [{ name: fc.name, args, id: raw.id ?? '' }];
  }
  return [];
}

/** `updates|tools:task|model:step` → base `updates` and namespace `tools:task|model:step`. */
function splitStreamEvent(sseType: string): { base: string; namespace: string } {
  const bar = sseType.indexOf('|');
  if (bar === -1) return { base: sseType, namespace: '' };
  return { base: sseType.slice(0, bar), namespace: sseType.slice(bar + 1) };
}

/** First tool-call id inside a tasks-stream input. A model-node state has none. */
function toolCallIdFromTaskInput(input: unknown): string | undefined {
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = toolCallIdFromTaskInput(item);
      if (found) return found;
    }
    return undefined;
  }
  if (!input || typeof input !== 'object') return undefined;
  const record = input as Record<string, unknown>;
  const nested = record.tool_call;
  if (nested && typeof nested === 'object') {
    const nestedId = (nested as Record<string, unknown>).id;
    if (typeof nestedId === 'string' && nestedId) return nestedId;
  }
  if (typeof record.id === 'string' && record.id && typeof record.name === 'string' && record.name) {
    return record.id;
  }
  return undefined;
}

function rememberTaskToolCalls(payload: unknown, taskToolCalls: Map<string, string>): void {
  const records = Array.isArray(payload) ? payload : [payload];
  for (const record of records) {
    if (!record || typeof record !== 'object') continue;
    const task = record as Record<string, unknown>;
    if (typeof task.id !== 'string' || !task.id || !('input' in task)) continue;
    const toolCallId = toolCallIdFromTaskInput(task.input);
    if (toolCallId) taskToolCalls.set(task.id, toolCallId);
  }
}

/** Outermost `node:taskId` segment whose task id dispatched a tool call. */
function toolCallIdFromNamespace(namespace: string, taskToolCalls: Map<string, string>): string | undefined {
  if (!namespace) return undefined;
  for (const segment of namespace.split('|')) {
    const colon = segment.lastIndexOf(':');
    if (colon === -1) continue;
    const toolCallId = taskToolCalls.get(segment.slice(colon + 1));
    if (toolCallId) return toolCallId;
  }
  return undefined;
}

function rememberMessageNamespaces(payload: unknown, messageNamespaces: Map<string, string>): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  for (const [messageId, value] of Object.entries(payload as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const metadata = (value as Record<string, unknown>).metadata;
    if (!metadata || typeof metadata !== 'object') continue;
    const namespace = (metadata as Record<string, unknown>).langgraph_checkpoint_ns;
    if (typeof namespace === 'string' && namespace) messageNamespaces.set(messageId, namespace);
  }
}

function translateMessageEvent(
  sseType: string,
  payload: unknown,
  chunkId: number,
  prevPartial: string,
  sentMsgIds: Set<string>,
): [Array<{ type: string; content: unknown }>, string] {
  // ── Handle 'updates' events (complete node outputs with full args) ──
  if (sseType === 'updates') {
    const data = payload as Record<string, any> | null;
    if (!data || typeof data !== 'object') return [[], prevPartial];

    const chunks: Array<{ type: string; content: unknown }> = [];

    const messageLists: any[][] = [];
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) {
        messageLists.push(value);
      } else if (value && typeof value === 'object' && Array.isArray((value as any).messages)) {
        messageLists.push((value as any).messages);
      }
    }

    for (const messages of messageLists) {
      for (const msg of messages) {
        if (!msg || typeof msg !== 'object') continue;
        const msgType = (msg.type ?? '').toString().toLowerCase();

        if ((msgType === 'ai' || msgType === 'aimessage') && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
          const msgId = msg.id ?? `ai-upd-${chunkId}`;
          if (sentMsgIds.has(msgId)) continue;
          sentMsgIds.add(msgId);
          const toolCalls = extractToolCalls(msg);
          chunks.push({
            type: 'message',
            content: { type: 'ai', content: '', tool_calls: toolCalls, id: msgId },
          });
        }

        if (msgType === 'tool' || msgType === 'toolmessage') {
          const toolCallId = msg.tool_call_id ?? '';
          const dedupKey = `tool-${toolCallId}`;
          if (!sentMsgIds.has(dedupKey)) {
            sentMsgIds.add(dedupKey);
            chunks.push({
              type: 'message',
              content: buildToolMessageContent(msg),
            });
          }
        }
      }
    }

    return [chunks, prevPartial];
  }

  // ── Handle 'messages/partial' (text token streaming only) ──
  if (sseType === 'messages/partial') {
    if (!Array.isArray(payload) || payload.length === 0) return [[], prevPartial];
    const [msg] = payload;
    if (!msg || typeof msg !== 'object') return [[], prevPartial];

    const raw = msg as Record<string, any>;
    const toolCalls = extractToolCalls(raw);

    if (toolCalls.length > 0) {
      const fullText = streamedAnswer(raw);
      return [[], fullText || prevPartial];
    }

      const fullText = streamedAnswer(raw);
    return [[], fullText];
  }

  // ── Handle 'messages/complete' (fallback for anything not sent via updates) ──
  if (sseType === 'messages/complete') {
    if (!Array.isArray(payload) || payload.length === 0) return [[], prevPartial];
    const [msg] = payload;
    if (!msg || typeof msg !== 'object') return [[], prevPartial];

    const raw = msg as Record<string, any>;
    const msgType = (raw.type ?? '').toString().toLowerCase();

    const toolCalls = extractToolCalls(raw);
    if ((msgType === 'ai' || msgType === 'aimessage' || !msgType) && toolCalls.length > 0) {
      const msgId = raw.id ?? `ai-${chunkId}`;
      if (!sentMsgIds.has(msgId)) {
        sentMsgIds.add(msgId);
        return [[{
          type: 'message',
          content: { type: 'ai', content: '', tool_calls: toolCalls, id: msgId },
        }], prevPartial];
      }
      return [[], prevPartial];
    }

    if (msgType === 'tool' || msgType === 'toolmessage') {
      const toolCallId = raw.tool_call_id ?? '';
      const dedupKey = `tool-${toolCallId}`;
      if (sentMsgIds.has(dedupKey)) return [[], prevPartial];
      sentMsgIds.add(dedupKey);
      return [[{
        type: 'message',
        content: buildToolMessageContent(raw),
      }], prevPartial];
    }

    if (msgType === 'ai' || msgType === 'aimessage') {
      const fullText = streamedAnswer(raw);
      if (fullText.length > 0) {
        return [[], fullText];
      }
    }
  }

  return [[], prevPartial];
}

interface TokenPair {
  accessToken: string | null;
  refreshToken: string | null;
  refreshFailed?: boolean;
}

/**
 * Return a valid access + refresh token pair, refreshing via the SSO
 * plugin if the current access token is expired or about to expire
 * (30 s buffer).  Saves the refreshed token set back into the session.
 *
 * The refresh_token is forwarded so the agent can do its own refresh
 * if the token expires while queued in the worker pipeline.
 */
async function ensureFreshTokens(
  fastify: FastifyInstance,
  request: any,
): Promise<TokenPair> {
  const session = request.session;
  const token = session?.token;
  if (!token?.access_token) return { accessToken: null, refreshToken: null };

  const expiresAt = token.expires_at ? new Date(token.expires_at).getTime() : 0;
  if (expiresAt - Date.now() > 30_000) {
    return { accessToken: token.access_token, refreshToken: token.refresh_token ?? null };
  }

  try {
    const sso = (fastify as any).redhatSSO;
    if (!sso) return { accessToken: token.access_token, refreshToken: token.refresh_token ?? null };

    const refreshed = await sso.getNewAccessTokenUsingRefreshToken(token, {});
    session.token = refreshed.token;
    fastify.log.info('Access token refreshed before agent call');
    return {
      accessToken: refreshed.token.access_token,
      refreshToken: refreshed.token.refresh_token ?? null,
    };
  } catch (err) {
    fastify.log.error({ err }, 'Token refresh failed');
    return { accessToken: null, refreshToken: null, refreshFailed: true };
  }
}

function sessionExpiredReply(reply: FastifyReply) {
  return reply.status(401).send({
    error: 'session_expired',
    message: 'Token refresh failed. Please log in again.',
  });
}

/** Forward client query string to the agent (e.g. GET /feedback/:id?user_id=...). */
function buildForwardedQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v !== undefined) params.append(key, String(v));
      }
    } else {
      params.append(key, String(value));
    }
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

async function pipeTranslatedAgentStream(
  fastify: FastifyInstance,
  reply: FastifyReply,
  runResp: Response,
  threadId: string,
  headers: Record<string, string>,
  traceId: string,
  timeoutMs: number,
): Promise<void> {
  try {
// ── 3. Translate Aegra SSE → UI chunk format ──
await reply.hijack();
reply.raw.writeHead(200, {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
  'X-Trace-ID': traceId,
  'X-Accel-Buffering': 'no',
});
reply.raw.flushHeaders();

const reader = (runResp.body as ReadableStream<Uint8Array>).getReader();
const decoder = new TextDecoder();
let buffer = '';
let chunkId = 0;
let clientGone = false;
let lastPartial = '';
const partialByMessageId = new Map<string, string>();
const thinkingByMessageId = new Map<string, string>();
const taskToolCalls = new Map<string, string>();
const messageNamespaces = new Map<string, string>();
const sentMsgIds = new Set<string>();
const completedTexts: string[] = [];

reply.raw.on('close', () => {
  clientGone = true;
  reader.cancel().catch(() => {});
});
reply.raw.on('error', () => {
  clientGone = true;
  reader.cancel().catch(() => {});
});

let hasEmittedTextTokens = false;
let interruptEmittedFromStream = false;
let streamEndedNormally = false;

try {
  while (!clientGone) {
    let done: boolean;
    let value: Uint8Array | undefined;
    try {
      ({ done, value } = await reader.read());
    } catch {
      fastify.log.warn({ traceId }, 'Agent stream connection lost — agent may have been killed');
      break;
    }
    if (done) {
      streamEndedNormally = true;
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const segments = buffer.split('\n\n');
    buffer = segments.pop() ?? '';

    for (const segment of segments) {
      if (clientGone) break;
      const trimmed = segment.trim();
      if (!trimmed) continue;

      let sseType = '';
      let sseData = '';
      for (const line of trimmed.split('\n')) {
        if (line.startsWith('event:')) sseType = line.slice(6).trim();
        else if (line.startsWith('data:')) sseData += line.slice(5).trim();
      }

      if (!sseData || sseType === 'end') continue;

      if (sseType === 'metadata') {
        try {
          const parsed = JSON.parse(sseData) as Record<string, unknown>;
          fastify.log.info({ traceId, sseType, parsedKeys: Object.keys(parsed) }, 'Raw metadata SSE from agent');

          if (
            typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed)
          ) {
            // LangGraph Platform metadata has { run_id } at top level
            // Emit in the format the frontend expects: { type: 'metadata', content: { run_id, trace_id, thread_id } }
            const runId = (parsed.run_id as string) || '';
            const metaPayload = {
              type: 'metadata',
              content: {
                run_id: runId,
                trace_id: runId,
                thread_id: threadId,
              },
            };
            reply.raw.write(`data: ${JSON.stringify(metaPayload)}\n\n`);
            chunkId++;
          }
        } catch {
          fastify.log.debug({ traceId, sseType, sseData }, 'Unparseable metadata SSE');
        }
        continue;
      }

      try {
        const parsed = JSON.parse(sseData) as unknown;
        const { base: eventBase, namespace: eventNamespace } = splitStreamEvent(sseType);

        if (eventBase === 'tasks') {
          rememberTaskToolCalls(parsed, taskToolCalls);
          continue;
        }

        if (eventBase === 'messages/metadata') {
          rememberMessageNamespaces(parsed, messageNamespaces);
          continue;
        }

        if (eventBase === 'updates' && eventNamespace === '') {
          const interrupt = extractInterruptFromUpdates(parsed);
          if (interrupt) {
            const interruptChunk = {
              type: 'interrupt',
              content: { value: interrupt.value, resumable: interrupt.resumable },
              chunk_id: chunkId,
            };
            reply.raw.write(`data: ${JSON.stringify(interruptChunk)}\n\n`);
            chunkId++;
            interruptEmittedFromStream = true;
            fastify.log.info({ traceId }, 'Emitted HITL interrupt from updates stream');
          }
        }

        const isMcpStatus =
          sseType === 'mcp_status' ||
          (typeof parsed === 'object' &&
            parsed !== null &&
            !Array.isArray(parsed) &&
            (parsed as Record<string, unknown>).type === 'mcp_status');
        if (isMcpStatus) {
          reply.raw.write(`event: mcp_status\ndata: ${JSON.stringify(parsed)}\n\n`);
          chunkId++;
          continue;
        }

        const isMessageText = eventBase === 'messages/partial' || eventBase === 'messages/complete';
        const partialMsg = isMessageText && Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : undefined;
        const activeMessageId = partialMsg && typeof partialMsg === 'object' && typeof (partialMsg as { id?: unknown }).id === 'string'
          ? (partialMsg as { id: string }).id
          : '';
        const prevPartial = isMessageText ? (partialByMessageId.get(activeMessageId) ?? '') : '';
        const prevThinking = isMessageText ? (thinkingByMessageId.get(activeMessageId) ?? '') : '';
        const messageNamespace = activeMessageId ? messageNamespaces.get(activeMessageId) : undefined;
        const subagentToolCallId = toolCallIdFromNamespace(eventNamespace, taskToolCalls)
          ?? (messageNamespace ? toolCallIdFromNamespace(messageNamespace, taskToolCalls) : undefined);

        const [uiChunks, nextPartial] = translateMessageEvent(
          eventBase,
          parsed,
          chunkId,
          prevPartial,
          sentMsgIds,
        );

        let nextThinking = prevThinking;
        const partialContent = partialMsg && typeof partialMsg === 'object'
          ? (partialMsg as Record<string, unknown>).content
          : undefined;
        if (
          isMessageText
          && partialMsg
          && typeof partialMsg === 'object'
          && typeof partialContent !== 'string'
        ) {
          nextThinking = splitMessageParts(partialMsg).thinking;
        }
        if (nextThinking.startsWith(prevThinking) && nextThinking.length > prevThinking.length) {
          const thinkingDelta = nextThinking.slice(prevThinking.length);
          const thinkingPayload: Record<string, unknown> = {
            type: 'token',
            content: thinkingDelta,
            chunk_id: chunkId,
            part: 'thinking',
          };
          if (activeMessageId) thinkingPayload.message_id = activeMessageId;
          if (subagentToolCallId) thinkingPayload.subagent_tool_call_id = subagentToolCallId;
          reply.raw.write(`data: ${JSON.stringify(thinkingPayload)}\n\n`);
          chunkId++;
        }
        if (isMessageText && nextThinking.startsWith(prevThinking)) {
          thinkingByMessageId.set(activeMessageId, nextThinking);
        }

        if (nextPartial.length > prevPartial.length && uiChunks.length === 0) {
          const isEchoOfPrior = completedTexts.some(
            (ct) => nextPartial.length <= ct.length && ct.startsWith(nextPartial),
          );
          if (!isEchoOfPrior) {
            const delta = nextPartial.slice(prevPartial.length);
            const tokenPayload: Record<string, unknown> = {
              type: 'token',
              content: delta,
              chunk_id: chunkId,
              part: 'text',
            };
            if (activeMessageId) tokenPayload.message_id = activeMessageId;
            if (subagentToolCallId) tokenPayload.subagent_tool_call_id = subagentToolCallId;
            reply.raw.write(`data: ${JSON.stringify(tokenPayload)}\n\n`);
            chunkId++;
            hasEmittedTextTokens = true;
          }
        }

        if (eventBase === 'messages/complete' && uiChunks.length === 0 && nextPartial.length > 0) {
          completedTexts.push(nextPartial);
        }

        if (isMessageText) {
          partialByMessageId.set(activeMessageId, nextPartial);
          lastPartial = nextPartial;
        }
        for (const chunk of uiChunks) {
          const content = chunk.content as { tool_call_id?: unknown } | undefined;
          const resultId = chunk.type === 'message' && content && typeof content.tool_call_id === 'string'
            ? content.tool_call_id
            : undefined;
          const stamp = Boolean(subagentToolCallId) && resultId !== subagentToolCallId;
          const stamped = stamp
            ? { ...chunk, subagent_tool_call_id: subagentToolCallId, chunk_id: chunkId }
            : { ...chunk, chunk_id: chunkId };
          reply.raw.write(`data: ${JSON.stringify(stamped)}\n\n`);
          chunkId++;
        }
      } catch {
        fastify.log.debug({ traceId, sseType, sseData }, 'Unparseable SSE data');
      }
    }
  }
} finally {
  reader.releaseLock();
}

if (!clientGone) {
  if (lastPartial.length > 0 && !hasEmittedTextTokens) {
    const isEcho = completedTexts.some(
      (ct) => lastPartial.length <= ct.length && ct.startsWith(lastPartial),
    );
    if (!isEcho) {
      const flush = { type: 'token', content: lastPartial, chunk_id: chunkId };
      reply.raw.write(`data: ${JSON.stringify(flush)}\n\n`);
      chunkId++;
    }
  }

  try {
    const stateResp = await fetch(
      `${getAgentHost()}/threads/${threadId}/state`,
      {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (stateResp.ok) {
      const threadState = await stateResp.json() as Record<string, unknown>;
      const tasks = Array.isArray(threadState.tasks) ? threadState.tasks : [];
      const interrupted = tasks.find(
        (t: any) => Array.isArray(t?.interrupts) && t.interrupts.length > 0,
      );
      if (interrupted && !interruptEmittedFromStream) {
        const firstInterrupt = (interrupted as any).interrupts[0];
        const interruptChunk = {
          type: 'interrupt',
          content: {
            value: firstInterrupt?.value ?? null,
            resumable: true,
          },
          chunk_id: chunkId,
        };
        reply.raw.write(`data: ${JSON.stringify(interruptChunk)}\n\n`);
        chunkId++;
        fastify.log.info({ traceId }, 'Emitted HITL interrupt from thread state (post-stream fallback)');
      }
    }
  } catch (err) {
    fastify.log.warn({ traceId, err }, 'Failed to check thread state for interrupts');
  }

  if (!streamEndedNormally) {
    fastify.log.warn({ traceId }, 'Agent stream ended abnormally — signalling error to frontend');
    const errChunk = {
      type: 'error',
      message: 'Agent connection lost during streaming. Recovery in progress.',
      chunk_id: chunkId,
    };
    reply.raw.write(`data: ${JSON.stringify(errChunk)}\n\n`);
    chunkId++;
  }

  fastify.log.info({ traceId, chunkId, streamEndedNormally }, 'Stream complete');
  invalidateThreadStateCache(threadId);
  reply.raw.end('data: [DONE]\n\n');
    }
  } catch (error: unknown) {
    const errName = (error as Error).name;
    if (errName === 'AbortError') {
      fastify.log.info({ traceId }, 'Client disconnected, stream aborted');
      return;
    }
    if (errName === 'TimeoutError') {
      fastify.log.warn({ traceId }, 'Agent stream timed out');
    } else {
      fastify.log.error({ traceId, err: error }, 'Proxy stream error');
    }
    if (reply.raw.headersSent) {
      reply.raw.end();
    } else {
      reply.status(502).send({ error: 'Failed to connect to agent service' });
    }
  }
}

async function proxyRoutes(fastify: FastifyInstance) {
  await fastify.register(authCheckPlugin);

  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 1048576 }, (req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim() === '')) {
      done(null, undefined);
    } else {
      try { done(null, JSON.parse(body as string)); } catch (err) { done(err as Error, undefined); }
    }
  });

  /**
   * Streaming endpoint — translates between the UI's simple
   * {message, thread_id, user_id} payload and Aegra's LangGraph
   * Platform API (POST /threads/{id}/runs/stream).
   */
  fastify.post<{ Body: StreamRequestBody }>(
    '/proxy/agent/v1/stream',
    async (request, reply) => {
      const cfg = getSettings();
      const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
      const { accessToken, refreshToken, refreshFailed } = await ensureFreshTokens(fastify, request);

      if (refreshFailed) {
        return sessionExpiredReply(reply);
      }

      if (!accessToken && process.env.AUTH_ENABLED === 'true') {
        return reply.status(401).send({ error: 'Not authenticated' });
      }

      const { message, thread_id, resume: isResume, project_id, requested_subagents } = request.body;
      const requestedSubagents = isResume ? [] : requestedSubagentNames(requested_subagents);

      if (project_id != null && typeof project_id !== 'string') {
        return reply.status(400).send({ error: 'project_id must be a string when provided' });
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId,
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      if (refreshToken) {
        headers['X-Refresh-Token'] = refreshToken;
      }

      const xUserId = resolveXUserId(request);
      headers['X-User-ID'] = xUserId;

      try {
        // ── 1. Ensure the thread exists (idempotent, retry once on 401) ──
        const createThread = async () => {
          return fetch(`${getAgentHost()}/threads`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
              threadId: thread_id,
              metadata: {
                user_identity: xUserId,
                ...(project_id ? { project_id } : {}),
              },
              ifExists: 'do_nothing',
            }),
            signal: AbortSignal.timeout(cfg.agent.timeout_ms),
          });
        };

        fastify.log.info({ traceId, thread_id }, 'Creating thread');
        let threadResp = await createThread();

        if (threadResp.status === 401) {
          fastify.log.warn({ traceId }, 'Thread creation got 401, retrying once');
          threadResp = await createThread();
        }

        if (!threadResp.ok) {
          const body = await threadResp.text();
          fastify.log.error(
            { traceId, status: threadResp.status, body },
            'Thread creation failed',
          );
          return reply.status(threadResp.status).send({ error: 'Thread creation failed' });
        }
        fastify.log.info({ traceId }, 'Thread ready');

        // ── 2. Start a streaming run on that thread ──
        const runUrl = `${getAgentHost()}/threads/${thread_id}/runs/stream`;
        fastify.log.info({ traceId, runUrl }, 'Starting streaming run');

        const runBody: Record<string, unknown> = {
          assistant_id: 'agent',
          stream_mode: ['messages', 'updates', 'tasks'],
          stream_subgraphs: true,
          on_disconnect: 'continue',
        };
        if (isResume) {
          runBody.command = { resume: message };
        } else {
          runBody.input = {
            messages: [{
              role: 'human',
              content: message,
              id: randomUUID(),
              ...(requestedSubagents.length > 0
                ? { additional_kwargs: { subagent_mentions: requestedSubagents } }
                : {}),
            }],
          };
        }

        runBody.config = {
          metadata: { trace_id: traceId, user_id: xUserId, source: 'ui' },
          configurable: {
            user_id: xUserId,
            interactive: true,
            ...(requestedSubagents.length > 0 ? { requested_subagents: requestedSubagents } : {}),
          },
        };

        const streamTimeoutMs = Math.max(cfg.agent.timeout_ms, 300_000);
        const runResp = await fetch(runUrl, {
          method: 'POST',
          headers: { ...headers, Accept: 'text/event-stream' },
          body: JSON.stringify(runBody),
          signal: AbortSignal.timeout(streamTimeoutMs),
        });

        if (!runResp.ok) {
          const body = await runResp.text();
          fastify.log.error(
            { traceId, status: runResp.status, body },
            'Agent run/stream failed',
          );
          let message = 'Agent request failed';
          try {
            const parsed = JSON.parse(body) as { message?: unknown };
            if (typeof parsed.message === 'string' && parsed.message.length > 0) message = parsed.message;
          } catch { /* the body was not JSON */ }
          return reply.status(runResp.status).send({
            error: message,
            status: runResp.status,
          });
        }

        await pipeTranslatedAgentStream(
          fastify,
          reply,
          runResp,
          thread_id,
          headers,
          traceId,
          cfg.agent.timeout_ms,
        );
      } catch (error: unknown) {
        const errName = (error as Error).name;
        if (errName === 'AbortError') {
          fastify.log.info({ traceId }, 'Client disconnected, stream aborted');
          return;
        }
        if (errName === 'TimeoutError') {
          fastify.log.warn({ traceId }, 'Agent stream timed out');
        } else {
          fastify.log.error({ traceId, err: error }, 'Proxy stream error');
        }
        if (reply.raw.headersSent) {
          reply.raw.end();
        } else {
          reply.status(502).send({ error: 'Failed to connect to agent service' });
        }
      }
    },
  );

  /**
   * Reattach to a run that is still going. The browser reloads, then this
   * opens the same agent stream and translates it like a new message.
   */
  fastify.get<{ Params: { threadId: string; runId: string } }>(
    '/proxy/agent/v1/stream/:threadId/:runId',
    async (request, reply) => {
      const cfg = getSettings();
      const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
      const { threadId, runId } = request.params;
      if (!/^[\w-]+$/.test(threadId) || !/^[\w-]+$/.test(runId)) {
        return reply.status(400).send({ error: 'Invalid run' });
      }
      const { accessToken, refreshToken, refreshFailed } = await ensureFreshTokens(fastify, request);
      if (refreshFailed) return sessionExpiredReply(reply);
      if (!accessToken && process.env.AUTH_ENABLED === 'true') {
        return reply.status(401).send({ error: 'Not authenticated' });
      }
      const headers: Record<string, string> = { 'X-Trace-ID': traceId };
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      if (refreshToken) headers['X-Refresh-Token'] = refreshToken;
      headers['X-User-ID'] = resolveXUserId(request);

      const runResp = await fetch(`${getAgentHost()}/threads/${threadId}/runs/${runId}/stream`, {
        method: 'GET',
        headers: { ...headers, Accept: 'text/event-stream' },
        signal: AbortSignal.timeout(Math.max(cfg.agent.timeout_ms, 300_000)),
      });
      if (!runResp.ok) {
        const body = await runResp.text();
        fastify.log.error({ traceId, status: runResp.status, body }, 'Agent run attach failed');
        return reply.status(runResp.status).send({ error: 'Agent request failed', status: runResp.status });
      }
      await pipeTranslatedAgentStream(
        fastify,
        reply,
        runResp,
        threadId,
        headers,
        traceId,
        cfg.agent.timeout_ms,
      );
    },
  );

  /**
   * Forward a JSON request to the agent with refreshed session tokens.
   * Used by MCP Apps host routes and the generic /proxy/agent/* pass-through.
   */
  async function forwardJsonToAgent(
    request: any,
    reply: FastifyReply,
    agentPath: string,
    options?: { method?: string; body?: unknown },
  ) {
    const cfg = getSettings();
    const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
    const { accessToken, refreshToken, refreshFailed } = await ensureFreshTokens(fastify, request);

    if (refreshFailed) {
      return sessionExpiredReply(reply);
    }

    if (!accessToken && process.env.AUTH_ENABLED === 'true') {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Trace-ID': traceId,
    };
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }
    if (refreshToken) {
      headers['X-Refresh-Token'] = refreshToken;
    }

    const method = options?.method ?? request.method;
    const queryString = buildForwardedQueryString(request.query as Record<string, unknown>);
    const agentUrl = `${getAgentHost()}/${agentPath.replace(/^\//, '')}${queryString}`;
    fastify.log.info({ traceId, method, agentUrl }, 'Proxying request to agent');

    try {
      const fetchOptions: RequestInit = {
        method,
        headers,
        signal: AbortSignal.timeout(cfg.agent.timeout_ms),
      };
      if (method !== 'GET' && method !== 'HEAD') {
        const body = options?.body !== undefined ? options.body : request.body;
        if (body !== undefined && body !== null) {
          fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
        }
      }

      const agentResponse = await fetch(agentUrl, fetchOptions);
      reply.header('X-Trace-ID', traceId);
      reply.status(agentResponse.status);
      const contentType = agentResponse.headers.get('content-type');
      if (contentType) {
        reply.header('Content-Type', contentType);
      }
      return reply.send(await agentResponse.text());
    } catch (error) {
      fastify.log.error({ traceId, err: error }, 'Proxy error');
      return reply.status(502).send({ error: 'Failed to connect to agent service' });
    }
  }

  // MCP Apps host proxy (SEP-1865) — browser never talks to MCP servers directly.
  fastify.post<{ Params: { mcpName: string }; Body: { cursor?: string } }>(
    '/proxy/agent/mcp/:mcpName/resources/list',
    async (request, reply) => {
      const cursor = request.body?.cursor;
      if (cursor !== undefined && typeof cursor !== 'string') {
        return reply.status(400).send({ error: 'cursor must be a string when provided' });
      }
      const mcpName = encodeURIComponent(request.params.mcpName);
      return forwardJsonToAgent(request, reply, `mcp/${mcpName}/resources/list`, {
        method: 'POST',
        body: cursor !== undefined ? { cursor } : {},
      });
    },
  );

  fastify.post<{ Params: { mcpName: string }; Body: { cursor?: string } }>(
    '/proxy/agent/mcp/:mcpName/resources/templates/list',
    async (request, reply) => {
      const cursor = request.body?.cursor;
      if (cursor !== undefined && typeof cursor !== 'string') {
        return reply.status(400).send({ error: 'cursor must be a string when provided' });
      }
      const mcpName = encodeURIComponent(request.params.mcpName);
      return forwardJsonToAgent(request, reply, `mcp/${mcpName}/resources/templates/list`, {
        method: 'POST',
        body: cursor !== undefined ? { cursor } : {},
      });
    },
  );

  fastify.post<{ Params: { mcpName: string }; Body: { uri?: string } }>(
    '/proxy/agent/mcp/:mcpName/resources/read',
    async (request, reply) => {
      const uri = request.body?.uri;
      if (typeof uri !== 'string' || !uri.trim()) {
        return reply.status(400).send({ error: 'uri is required' });
      }
      const mcpName = encodeURIComponent(request.params.mcpName);
      return forwardJsonToAgent(request, reply, `mcp/${mcpName}/resources/read`, {
        method: 'POST',
        body: { uri },
      });
    },
  );

  fastify.post<{ Params: { mcpName: string }; Body: { cursor?: string } }>(
    '/proxy/agent/mcp/:mcpName/tools/list',
    async (request, reply) => {
      const cursor = request.body?.cursor;
      if (cursor !== undefined && typeof cursor !== 'string') {
        return reply.status(400).send({ error: 'cursor must be a string when provided' });
      }
      const mcpName = encodeURIComponent(request.params.mcpName);
      return forwardJsonToAgent(request, reply, `mcp/${mcpName}/tools/list`, {
        method: 'POST',
        body: cursor !== undefined ? { cursor } : {},
      });
    },
  );

  fastify.post<{
    Params: { mcpName: string };
    Body: { name?: string; arguments?: Record<string, unknown> };
  }>('/proxy/agent/mcp/:mcpName/tools/call', async (request, reply) => {
    const toolName = request.body?.name;
    if (typeof toolName !== 'string' || !toolName.trim()) {
      return reply.status(400).send({ error: 'tool name is required' });
    }
    const args = request.body?.arguments;
    if (args !== undefined && (args === null || typeof args !== 'object' || Array.isArray(args))) {
      return reply.status(400).send({
        error: 'arguments must be a JSON object when provided',
      });
    }
    const mcpName = encodeURIComponent(request.params.mcpName);
    return forwardJsonToAgent(request, reply, `mcp/${mcpName}/tools/call`, {
      method: 'POST',
      body: { name: toolName, arguments: args ?? {} },
    });
  });

  // Generic pass-through (threads, mcp oauth connect/status, etc.)
  fastify.all<{ Params: { '*': string } }>(
    '/proxy/agent/*',
    async (request, reply) => {
      const cfg = getSettings();
      const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
      const path = (request.params as any)['*'];
      const { accessToken, refreshToken, refreshFailed } = await ensureFreshTokens(fastify, request);

      if (refreshFailed) {
        return sessionExpiredReply(reply);
      }

      if (!accessToken && process.env.AUTH_ENABLED === 'true') {
        return reply.status(401).send({ error: 'Not authenticated' });
      }

      const headers: Record<string, string> = {
        'X-Trace-ID': traceId,
      };
      const hasBody = request.body !== undefined && request.body !== null;
      if (request.method !== 'GET' && (request.method !== 'DELETE' || hasBody)) {
        headers['Content-Type'] = 'application/json';
      }

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      if (refreshToken) {
        headers['X-Refresh-Token'] = refreshToken;
      }

      headers['X-User-ID'] = resolveXUserId(request);

      try {
        const queryString = buildForwardedQueryString(request.query as Record<string, unknown>);
        const agentUrl = `${getAgentHost()}/${path}${queryString}`;
        fastify.log.info({ traceId, method: request.method, agentUrl }, 'Proxying request to agent');

        // Check BFF cache for GET /threads/{id}/state
        const threadStateMatch = request.method === 'GET' && path.match(/^threads\/([^/]+)\/state$/);
        if (threadStateMatch) {
          const fresh = request.headers['cache-control'] === 'no-cache';
          const cached = fresh ? null : getCachedThreadState(threadStateMatch[1]);
          if (cached) {
            fastify.log.info({ traceId }, 'Thread state cache HIT');
            reply.header('X-Trace-ID', traceId);
            reply.header('Content-Type', 'application/json');
            reply.header('X-Cache', 'HIT');
            return reply.status(200).send(cached);
          }
        }

        const fetchOptions: RequestInit = {
          method: request.method,
          headers,
          signal: AbortSignal.timeout(cfg.agent.timeout_ms),
        };

        if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
          fetchOptions.body = JSON.stringify(request.body);
        }

        const agentResponse = await fetch(agentUrl, fetchOptions);

        reply.header('X-Trace-ID', traceId);
        reply.status(agentResponse.status);

        const contentType = agentResponse.headers.get('content-type');
        if (contentType) {
          reply.header('Content-Type', contentType);
        }

        const responseBody = await agentResponse.text();

        // Cache successful thread state responses
        if (threadStateMatch && agentResponse.ok) {
          setCachedThreadState(threadStateMatch[1], responseBody);
          reply.header('X-Cache', 'MISS');
        }

        return reply.send(responseBody);
      } catch (error) {
        fastify.log.error({ traceId, err: error }, 'Proxy error');
        return reply.status(502).send({ error: 'Failed to connect to agent service' });
      }
    }
  );

  fastify.post('/proxy/agent/feedback', async (request, reply) => {
    const cfg = getSettings();
    const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
    const { accessToken, refreshFailed } = await ensureFreshTokens(fastify, request);

    if (refreshFailed) {
      return sessionExpiredReply(reply);
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Trace-ID': traceId,
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const agentUrl = `${getAgentHost()}/feedback`;
      const agentResponse = await fetch(agentUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(cfg.agent.timeout_ms),
      });

      reply.header('X-Trace-ID', traceId);
      reply.status(agentResponse.status);
      const responseBody = await agentResponse.text();
      return reply.send(responseBody);
    } catch (error) {
      fastify.log.error({ traceId, err: error }, 'Feedback proxy error');
      return reply.status(502).send({ error: 'Failed to send feedback' });
    }
  });

  fastify.get('/health/agent', async (request, reply) => {
    try {
      const agentResponse = await fetch(`${getAgentHost()}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const body = agentResponse.ok ? await agentResponse.json().catch(() => ({})) as Record<string, unknown> : {};
      return reply.send({
        status: agentResponse.ok ? ((body as Record<string, unknown>).status || 'healthy') : 'unhealthy',
        statusCode: agentResponse.status,
        timestamp: new Date().toISOString(),
      });
    } catch {
      return reply.send({
        status: 'unreachable',
        timestamp: new Date().toISOString(),
      });
    }
  });

  fastify.post('/auth/generate-one-time-token', async (request, reply) => {
    const { accessToken, refreshFailed } = await ensureFreshTokens(fastify, request);

    if (refreshFailed) {
      return sessionExpiredReply(reply);
    }

    if (!accessToken && process.env.AUTH_ENABLED === 'true') {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    return reply.send({ token: accessToken || '' });
  });
}

export { proxyRoutes };
