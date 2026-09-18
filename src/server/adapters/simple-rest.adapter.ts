import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getSettings } from '../utils/settings.js';
import {
  getAgentHost,
  resolveXUserId,
  ensureFreshTokens,
  sessionExpiredReply,
} from './shared.js';
import type { AgentAdapter, StreamRequestBody } from './types.js';

/**
 * Adapter for plain custom REST + NDJSON agent engines — e.g. Harbor Agent
 * (see `harbor-ui/src/services/api/chatbot-services.ts`), which exposes:
 *
 *   GET    /health
 *   POST   /v1/stream            (NDJSON: one JSON object per line, terminated by a literal "[DONE]" line)
 *   GET    /v1/threads           -> ThreadHistoryItem[]
 *   GET    /v1/history/:threadId -> { messages: ThreadMessage[] }
 *   DELETE /v1/threads/:threadId
 *   DELETE /v1/threads           (delete all)
 *   POST   /v1/feedback          { run_id, key, score }
 *
 * No thread creation call, no server-side thread state endpoint, no HITL
 * interrupts, no sub-agents, no MCP, no feedback-retrieval API. This adapter
 * translates that surface onto the same fixed BFF contract `langgraph.adapter.ts`
 * implements, so the frontend (`src/frontend/services/agent-rest.ts`,
 * `useStreamingAPI.ts`, `feedback-api.ts`) doesn't need to know which engine
 * is on the other end.
 *
 * Known limitations vs. the langgraph adapter (documented in
 * `docs/deployment-patterns.md`):
 *  - `resume` (HITL) is rejected — simple-rest agents have no interrupt model.
 *  - Tool-result messages have no `tool_call_id` in Harbor's stream payload,
 *    so tool call/result correlation in the UI may not merge as tightly as
 *    it does for LangGraph agents.
 *  - `getThreadFeedback` has no backing API — always returns `{ feedback: [] }`.
 *  - Deploy with `features.projects_enabled=false` and `features.evals_enabled=false`;
 *    this adapter does not implement project-scoped threads or an evals API.
 */

interface HarborThreadHistoryItem {
  thread_id: string;
  thread_title: string;
  thread_created_at: string;
  thread_updated_at: string;
}

interface HarborThreadMessage {
  type: 'human' | 'ai' | 'tool';
  content: string;
  tool_calls?: Array<{ name: string; args: Record<string, unknown>; id?: string }>;
  tool_call_id?: string | null;
  run_id?: string;
  thread_id: string;
  session_id: string;
  response_metadata?: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
  created_at?: string;
}

/** Max size of a single unterminated NDJSON line buffer before we abort the stream (1 MiB). */
const MAX_NDJSON_LINE_LENGTH = 1024 * 1024;

function agentHeaders(accessToken: string | null): Record<string, string> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
  return headers;
}

async function handleStream(
  fastify: FastifyInstance,
  request: FastifyRequest<{ Body: StreamRequestBody }>,
  reply: FastifyReply,
): Promise<void> {
  const cfg = getSettings();
  const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
  const { accessToken, refreshFailed } = await ensureFreshTokens(fastify, request);

  if (refreshFailed) {
    sessionExpiredReply(reply);
    return;
  }
  if (!accessToken && process.env.AUTH_ENABLED === 'true') {
    reply.status(401).send({ error: 'Not authenticated' });
    return;
  }

  const { message, thread_id, resume, session_id } = request.body;

  if (resume) {
    // Harbor Agent has no HITL/interrupt model — nothing to resume.
    reply.status(400).send({
      error: 'unsupported_operation',
      message: 'This agent does not support resuming interrupted runs.',
    });
    return;
  }

  const xUserId = resolveXUserId(request);
  const streamUrl = `${getAgentHost()}/v1/stream`;
  const streamTimeoutMs = Math.max(cfg.agent.timeout_ms, 300_000);

  let agentResp: Response;
  try {
    agentResp = await fetch(streamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId,
        ...agentHeaders(accessToken),
      },
      body: JSON.stringify({
        message,
        thread_id,
        session_id: session_id ?? thread_id,
        stream_tokens: true,
        userId: xUserId,
      }),
      signal: AbortSignal.timeout(streamTimeoutMs),
    });
  } catch (error) {
    fastify.log.error({ traceId, err: error }, 'Harbor Agent stream request failed');
    reply.status(502).send({ error: 'Failed to connect to agent service' });
    return;
  }

  if (!agentResp.ok || !agentResp.body) {
    const body = await agentResp.text().catch(() => '');
    fastify.log.error({ traceId, status: agentResp.status, body }, 'Harbor Agent stream failed');
    reply.status(agentResp.status || 502).send({ error: 'Agent request failed', status: agentResp.status });
    return;
  }

  await reply.hijack();
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Trace-ID': traceId,
    'X-Accel-Buffering': 'no',
  });
  reply.raw.flushHeaders();

  // Emit metadata immediately — Harbor doesn't hand out a run_id until the
  // first `message` event, and the UI only uses this for display/association,
  // not for HITL (which this adapter doesn't support anyway).
  let chunkId = 0;
  const write = (payload: Record<string, unknown>) => {
    reply.raw.write(`data: ${JSON.stringify({ ...payload, chunk_id: chunkId })}\n\n`);
    chunkId++;
  };
  write({ type: 'metadata', content: { run_id: traceId, trace_id: traceId, thread_id } });

  const reader = agentResp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let clientGone = false;
  let done = false;
  let hasStreamedText = false;

  reply.raw.on('close', () => {
    clientGone = true;
    reader.cancel().catch(() => {});
  });
  reply.raw.on('error', () => {
    clientGone = true;
    reader.cancel().catch(() => {});
  });

  try {
    while (!clientGone && !done) {
      let chunkDone: boolean;
      let chunkValue: Uint8Array | undefined;
      try {
        ({ done: chunkDone, value: chunkValue } = await reader.read());
      } catch {
        fastify.log.warn({ traceId }, 'Harbor Agent stream connection lost');
        break;
      }
      if (chunkDone) break;

      buffer += decoder.decode(chunkValue, { stream: true });
      const lines = buffer.split('\n');
      // Only the trailing, not-yet-newline-terminated remainder can grow
      // unbounded — complete lines above are processed and discarded below.
      // Checking the cap on the *split* remainder (not the pre-split buffer)
      // means a chunk containing many complete small records that happens to
      // total over the cap doesn't spuriously trip this.
      buffer = lines.pop() ?? '';
      if (buffer.length > MAX_NDJSON_LINE_LENGTH) {
        // Guard against unbounded memory growth: a slow/misbehaving agent
        // could send one extremely long line (no '\n') for the entire
        // request timeout window, growing `buffer` indefinitely in the
        // meantime. Bail out instead of continuing to accumulate.
        fastify.log.error(
          { traceId, bufferLength: buffer.length },
          'Harbor Agent NDJSON line exceeded max buffer size — aborting stream',
        );
        write({ type: 'error', message: 'Agent response exceeded maximum buffer size.' });
        done = true;
        reader.cancel().catch(() => {});
        break;
      }

      for (const rawLine of lines) {
        if (clientGone) break;
        const line = rawLine.trim();
        if (!line) continue;

        if (line === '[DONE]') {
          done = true;
          break;
        }

        let event: Record<string, any>;
        try {
          event = JSON.parse(line);
        } catch {
          fastify.log.debug({ traceId, line }, 'Unparseable NDJSON line from Harbor Agent');
          continue;
        }

        switch (event.type) {
          case 'token': {
            write({ type: 'token', content: event.content ?? '' });
            hasStreamedText = true;
            break;
          }
          case 'message': {
            const c = event.content ?? {};
            if (c.type === 'ai') {
              const toolCalls = Array.isArray(c.tool_calls)
                ? c.tool_calls.map((tc: any) => ({ name: tc.name, args: tc.args ?? {}, id: tc.id ?? randomUUID() }))
                : [];
              write({
                type: 'message',
                content: {
                  type: 'ai',
                  content: toolCalls.length > 0 ? '' : (c.content ?? ''),
                  tool_calls: toolCalls,
                  id: c.run_id ?? randomUUID(),
                },
              });
            } else if (c.type === 'tool') {
              // Harbor's stream payload has no tool_call_id, unlike its
              // /v1/history response — the UI's AI/tool-result merge
              // (combineToolCallandResult) may not correlate perfectly.
              write({
                type: 'message',
                content: {
                  type: 'tool',
                  content: c.content ?? '',
                  tool_call_id: '',
                  name: 'unknown',
                },
              });
            }
            break;
          }
          case 'content_replace': {
            // Full-content replace: discard whatever partial text we've
            // streamed so far for this turn and emit the replacement in full,
            // mirroring how the langgraph adapter handles echoed drafts.
            if (hasStreamedText) {
              write({ type: 'draft_discard' });
            }
            const content = typeof event.content === 'string' ? event.content : '';
            write({ type: 'token', content });
            hasStreamedText = true;
            break;
          }
          case 'error': {
            write({ type: 'error', message: event.content?.message ?? 'Unknown agent error' });
            break;
          }
          default:
            fastify.log.debug({ traceId, eventType: event.type }, 'Unhandled Harbor Agent stream event type');
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (!clientGone) {
    if (!done) {
      write({ type: 'error', message: 'Agent connection lost during streaming. Recovery in progress.' });
    }
    fastify.log.info({ traceId, chunkId, done }, 'Harbor Agent stream complete');
    reply.raw.end('data: [DONE]\n\n');
  }
}

async function searchThreads(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const cfg = getSettings();
  const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
  const { accessToken, refreshFailed } = await ensureFreshTokens(fastify, request);

  if (refreshFailed) {
    sessionExpiredReply(reply);
    return;
  }
  if (!accessToken && process.env.AUTH_ENABLED === 'true') {
    reply.status(401).send({ error: 'Not authenticated' });
    return;
  }

  try {
    const agentResp = await fetch(`${getAgentHost()}/v1/threads`, {
      method: 'GET',
      headers: { 'X-Trace-ID': traceId, ...agentHeaders(accessToken) },
      signal: AbortSignal.timeout(cfg.agent.timeout_ms),
    });

    if (!agentResp.ok) {
      reply.status(agentResp.status).send([]);
      return;
    }

    const items = (await agentResp.json()) as HarborThreadHistoryItem[];
    // Map Harbor's flat thread list onto the LangGraph Platform thread-search
    // shape the frontend's getAllThreadsByUserId() expects.
    const mapped = items.map((t) => ({
      thread_id: t.thread_id,
      metadata: { thread_name: t.thread_title },
      created_at: t.thread_created_at,
      updated_at: t.thread_updated_at,
    }));
    reply.header('X-Trace-ID', traceId);
    reply.send(mapped);
  } catch (error) {
    fastify.log.error({ traceId, err: error }, 'Harbor Agent thread search proxy error');
    reply.status(502).send([]);
  }
}

async function getThreadState(
  fastify: FastifyInstance,
  request: FastifyRequest<{ Params: { threadId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const cfg = getSettings();
  const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
  const { accessToken, refreshFailed } = await ensureFreshTokens(fastify, request);

  if (refreshFailed) {
    sessionExpiredReply(reply);
    return;
  }
  if (!accessToken && process.env.AUTH_ENABLED === 'true') {
    reply.status(401).send({ error: 'Not authenticated' });
    return;
  }

  const threadId = request.params.threadId;

  try {
    const agentResp = await fetch(`${getAgentHost()}/v1/history/${encodeURIComponent(threadId)}`, {
      method: 'GET',
      headers: { 'X-Trace-ID': traceId, ...agentHeaders(accessToken) },
      signal: AbortSignal.timeout(cfg.agent.timeout_ms),
    });

    if (!agentResp.ok) {
      reply.status(agentResp.status).send({ values: { messages: [] }, tasks: [] });
      return;
    }

    const data = (await agentResp.json()) as { messages: HarborThreadMessage[] };
    reply.header('X-Trace-ID', traceId);
    reply.header('Content-Type', 'application/json');
    // No HITL support ⇒ `tasks` is always empty, so getThreadPendingInterrupt()
    // on the frontend never finds an interrupt for a simple-rest agent.
    reply.send({ values: { messages: data.messages ?? [] }, tasks: [] });
  } catch (error) {
    fastify.log.error({ traceId, err: error }, 'Harbor Agent thread state proxy error');
    reply.status(502).send({ values: { messages: [] }, tasks: [] });
  }
}

async function deleteThread(
  fastify: FastifyInstance,
  request: FastifyRequest<{ Params: { threadId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const cfg = getSettings();
  const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
  const { accessToken, refreshFailed } = await ensureFreshTokens(fastify, request);

  if (refreshFailed) {
    sessionExpiredReply(reply);
    return;
  }
  if (!accessToken && process.env.AUTH_ENABLED === 'true') {
    reply.status(401).send({ error: 'Not authenticated' });
    return;
  }

  try {
    const agentResp = await fetch(`${getAgentHost()}/v1/threads/${encodeURIComponent(request.params.threadId)}`, {
      method: 'DELETE',
      headers: { 'X-Trace-ID': traceId, ...agentHeaders(accessToken) },
      signal: AbortSignal.timeout(cfg.agent.timeout_ms),
    });
    reply.status(agentResp.status).send();
  } catch (error) {
    fastify.log.error({ traceId, err: error }, 'Harbor Agent thread delete proxy error');
    reply.status(502).send({ error: 'Failed to connect to agent service' });
  }
}

async function submitFeedback(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const cfg = getSettings();
  const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
  const { accessToken, refreshFailed } = await ensureFreshTokens(fastify, request);

  if (refreshFailed) {
    sessionExpiredReply(reply);
    return;
  }
  if (!accessToken && process.env.AUTH_ENABLED === 'true') {
    reply.status(401).send({ error: 'Not authenticated' });
    return;
  }

  const body = (request.body ?? {}) as {
    trace_id?: string;
    value?: number;
    thread_id?: string;
    message_id?: string;
  };

  // Frontend's generic FeedbackPayload -> Harbor's fixed
  // { run_id, key: 'human-feedback-stars', score } shape. Harbor has one
  // feedback dimension, so `name` (e.g. "thumbs-up") is dropped; `message_id`
  // is preferred over `trace_id` as the run identifier when present, since
  // Harbor associates feedback with the message's `run_id`.
  const harborPayload = {
    run_id: body.message_id || body.trace_id || '',
    key: 'human-feedback-stars',
    score: body.value ?? 0,
  };

  try {
    const agentResp = await fetch(`${getAgentHost()}/v1/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId,
        ...agentHeaders(accessToken),
      },
      body: JSON.stringify(harborPayload),
      signal: AbortSignal.timeout(cfg.agent.timeout_ms),
    });
    const responseBody = await agentResp.text();
    reply.header('X-Trace-ID', traceId);
    reply.status(agentResp.status).send(responseBody);
  } catch (error) {
    fastify.log.error({ traceId, err: error }, 'Harbor Agent feedback proxy error');
    reply.status(502).send({ error: 'Failed to send feedback' });
  }
}

/**
 * Harbor Agent has no feedback-retrieval endpoint (`chatbot-services.ts`
 * only submits feedback, never lists it back). Always report "no feedback
 * recorded" so the UI's per-message thumbs state defaults to unset instead
 * of erroring.
 */
async function getThreadFeedback(
  _fastify: FastifyInstance,
  _request: FastifyRequest<{ Params: { threadId: string } }>,
  reply: FastifyReply,
): Promise<void> {
  reply.send({ feedback: [] });
}

export const simpleRestAdapter: AgentAdapter = {
  handleStream,
  searchThreads,
  getThreadState,
  deleteThread,
  submitFeedback,
  getThreadFeedback,
};
