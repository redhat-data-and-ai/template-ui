import { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getSettings } from '../utils/settings.js';
import authCheckPlugin from '../plugins/auth-check.plugin.js';

function getAgentHost(): string {
  const cfg = getSettings();
  return cfg.agent.endpoint || process.env.AGENT_HOST || "http://localhost:5002";
}

/** In-memory LRU cache for thread state responses (avoids repeated LangGraph deserialization). */
const THREAD_STATE_CACHE = new Map<string, { body: string; ts: number }>();
const CACHE_TTL_MS = 30_000; // 30s
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
  memories?: string[];
  rules?: string[];
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
              content: {
                type: 'tool',
                content: extractText(msg.content) || JSON.stringify(msg.content),
                tool_call_id: toolCallId,
                name: msg.name ?? 'unknown',
              },
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
      const fullText = extractText(raw.content);
      return [[], fullText || prevPartial];
    }

    const fullText = extractText(raw.content);
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
        content: {
          type: 'tool',
          content: extractText(raw.content) || JSON.stringify(raw.content),
          tool_call_id: toolCallId,
          name: raw.name ?? 'unknown',
        },
      }], prevPartial];
    }

    if (msgType === 'ai' || msgType === 'aimessage') {
      const fullText = extractText(raw.content);
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

async function proxyRoutes(fastify: FastifyInstance) {
  await fastify.register(authCheckPlugin);

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

      const { message, thread_id, user_id, resume: isResume, memories, rules } = request.body;

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

      try {
        // ── 1. Ensure the thread exists (idempotent) ──
        fastify.log.info({ traceId, thread_id }, 'Creating thread');
        const threadResp = await fetch(`${getAgentHost()}/threads`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            threadId: thread_id,
            metadata: { user_identity: user_id ?? 'anonymous' },
            ifExists: 'do_nothing',
          }),
          signal: AbortSignal.timeout(cfg.agent.timeout_ms),
        });

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
          stream_mode: ['messages', 'updates', 'custom'],
        };
        if (isResume) {
          runBody.command = { resume: message };
        } else {
          runBody.input = { messages: [{ role: 'human', content: message }] };
        }

        const configurable: Record<string, unknown> = {};
        if (Array.isArray(memories) && memories.length > 0) configurable.user_memories = memories;
        if (Array.isArray(rules) && rules.length > 0) configurable.user_rules = rules;
        if (Object.keys(configurable).length > 0) {
          runBody.config = { configurable, metadata: { trace_id: traceId } };
        } else {
          runBody.config = { metadata: { trace_id: traceId } };
        }

        const runResp = await fetch(runUrl, {
          method: 'POST',
          headers: { ...headers, Accept: 'text/event-stream' },
          body: JSON.stringify(runBody),
          signal: AbortSignal.timeout(cfg.agent.timeout_ms),
        });

        if (!runResp.ok) {
          const body = await runResp.text();
          fastify.log.error(
            { traceId, status: runResp.status, body },
            'Agent run/stream failed',
          );
          return reply.status(runResp.status).send({
            error: 'Agent request failed',
            status: runResp.status,
          });
        }

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
        let prevPartial = '';
        const sentMsgIds = new Set<string>();
        const completedTexts: string[] = [];

        reply.raw.on('close', () => {
          clientGone = true;
          reader.cancel().catch(() => {});
        });

        let hasEmittedTextTokens = false;
        let interruptEmittedFromStream = false;

        try {
          while (!clientGone) {
            const { done, value } = await reader.read();
            if (done) break;

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
                        thread_id: thread_id,
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

                if (sseType === 'updates') {
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

                // Code execution output streaming (stream_mode="custom")
                // Skip ALL custom events to avoid corrupting partial text state
                if (sseType === 'custom') {
                  if (
                    typeof parsed === 'object' &&
                    parsed !== null &&
                    (parsed as Record<string, unknown>).type === 'code_output'
                  ) {
                    const codeChunk = {
                      type: 'code_output',
                      content: (parsed as Record<string, unknown>).content ?? '',
                      chunk_id: chunkId,
                    };
                    reply.raw.write(`event: chunk\ndata: ${JSON.stringify(codeChunk)}\n\n`);
                    chunkId++;
                  }
                  continue;
                }

                const [uiChunks, nextPartial] = translateMessageEvent(
                  sseType,
                  parsed,
                  chunkId,
                  prevPartial,
                  sentMsgIds,
                );

                if (nextPartial.length > prevPartial.length && uiChunks.length === 0) {
                  const isEchoOfPrior = completedTexts.some(
                    (ct) => nextPartial.length <= ct.length && ct.startsWith(nextPartial),
                  );
                  if (!isEchoOfPrior) {
                    const delta = nextPartial.slice(prevPartial.length);
                    reply.raw.write(`data: ${JSON.stringify({ type: 'token', content: delta, chunk_id: chunkId })}\n\n`);
                    chunkId++;
                    hasEmittedTextTokens = true;
                  }
                }

                if (sseType === 'messages/complete' && uiChunks.length === 0 && nextPartial.length > 0) {
                  completedTexts.push(nextPartial);
                }

                prevPartial = nextPartial;
                for (const chunk of uiChunks) {
                  reply.raw.write(`data: ${JSON.stringify({ ...chunk, chunk_id: chunkId })}\n\n`);
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
          if (prevPartial.length > 0 && !hasEmittedTextTokens) {
            const isEcho = completedTexts.some(
              (ct) => prevPartial.length <= ct.length && ct.startsWith(prevPartial),
            );
            if (!isEcho) {
              const flush = { type: 'token', content: prevPartial, chunk_id: chunkId };
              reply.raw.write(`data: ${JSON.stringify(flush)}\n\n`);
              chunkId++;
            }
          }

          try {
            const stateResp = await fetch(
              `${getAgentHost()}/threads/${thread_id}/state`,
              {
                method: 'GET',
                headers,
                signal: AbortSignal.timeout(cfg.agent.timeout_ms),
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

          fastify.log.info({ traceId, chunkId }, 'Stream complete');
          invalidateThreadStateCache(thread_id);
          reply.raw.end('data: [DONE]\n\n');
        }
      } catch (error: unknown) {
        if ((error as Error).name === 'AbortError') {
          fastify.log.info({ traceId }, 'Client disconnected, stream aborted');
          return;
        }
        fastify.log.error({ traceId, error }, 'Proxy stream error');
        if (reply.raw.headersSent) {
          reply.raw.end();
        } else {
          reply.status(502).send({ error: 'Failed to connect to agent service' });
        }
      }
    },
  );

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
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId,
      };

      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
      if (refreshToken) {
        headers['X-Refresh-Token'] = refreshToken;
      }

      try {
        const queryString = buildForwardedQueryString(request.query as Record<string, unknown>);
        const agentUrl = `${getAgentHost()}/${path}${queryString}`;
        fastify.log.info({ traceId, method: request.method, agentUrl }, 'Proxying request to agent');

        // Check BFF cache for GET /threads/{id}/state
        const threadStateMatch = request.method === 'GET' && path.match(/^threads\/([^/]+)\/state$/);
        if (threadStateMatch) {
          const cached = getCachedThreadState(threadStateMatch[1]);
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
        fastify.log.error({ traceId, error }, 'Proxy error');
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
      fastify.log.error({ traceId, error }, 'Feedback proxy error');
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
