import { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { agentHost } from '../utils/config.js';

interface StreamRequestBody {
  message: string;
  thread_id: string;
  user_id?: string;
  session_id?: string;
  stream_tokens?: boolean;
}

interface ProxyRequestBody {
  [key: string]: unknown;
}

/**
 * Translate a LangGraph messages-mode SSE event into the UI chunk format
 * the frontend useDataStream hook expects.
 *
 * Returns null when the event should be silently skipped.
 */
function translateMessageEvent(
  sseType: string,
  payload: unknown,
  chunkId: number,
): { type: string; content: unknown; chunk_id: number } | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const [msg] = payload;
  if (!msg || typeof msg !== 'object') return null;

  if (sseType === 'messages/partial') {
    const content = (msg as any).content;
    if (typeof content === 'string' && content.length > 0) {
      return { type: 'token', content, chunk_id: chunkId };
    }
    return null;
  }

  if (sseType === 'messages/complete') {
    const raw = msg as Record<string, any>;
    const msgType = (raw.type ?? '').toString().toLowerCase();

    if ((msgType === 'ai' || msgType === 'aimessage') && raw.tool_calls?.length) {
      return {
        type: 'message',
        content: {
          type: 'ai',
          content: raw.content ?? '',
          tool_calls: (raw.tool_calls as any[]).map((tc) => ({
            name: tc.name,
            args: tc.args ?? {},
            id: tc.id,
          })),
          id: raw.id ?? `ai-${chunkId}`,
        },
        chunk_id: chunkId,
      };
    }

    if (msgType === 'tool' || msgType === 'toolmessage') {
      return {
        type: 'message',
        content: {
          type: 'tool',
          content:
            typeof raw.content === 'string'
              ? raw.content
              : JSON.stringify(raw.content),
          tool_call_id: raw.tool_call_id ?? '',
          name: raw.name ?? 'unknown',
        },
        chunk_id: chunkId,
      };
    }
  }

  return null;
}

async function proxyRoutes(fastify: FastifyInstance) {
  /**
   * Streaming endpoint — translates between the UI's simple
   * {message, thread_id, user_id} payload and Aegra's LangGraph
   * Platform API (POST /threads/{id}/runs/stream).
   */
  fastify.post<{ Body: StreamRequestBody }>(
    '/proxy/agent/v1/stream',
    async (request, reply) => {
      const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
      const session = request.session;
      const accessToken = session?.token?.access_token;

      if (!accessToken && process.env.AUTH_ENABLED === 'true') {
        return reply.status(401).send({ error: 'Not authenticated' });
      }

      const { message, thread_id, user_id } = request.body;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Trace-ID': traceId,
      };
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      try {
        // ── 1. Ensure the thread exists (idempotent) ──
        fastify.log.info({ traceId, thread_id }, 'Creating thread');
        const threadResp = await fetch(`${agentHost}/threads`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            threadId: thread_id,
            metadata: { user_identity: user_id ?? 'anonymous' },
            ifExists: 'do_nothing',
          }),
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
        const runUrl = `${agentHost}/threads/${thread_id}/runs/stream`;
        fastify.log.info({ traceId, runUrl }, 'Starting streaming run');

        const runResp = await fetch(runUrl, {
          method: 'POST',
          headers: { ...headers, Accept: 'text/event-stream' },
          body: JSON.stringify({
            assistant_id: 'agent',
            input: { messages: [{ role: 'human', content: message }] },
            stream_mode: ['messages'],
            stream_subgraphs: true,
          }),
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
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Trace-ID': traceId,
        });

        const reader = (runResp.body as ReadableStream<Uint8Array>).getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let chunkId = 0;
        let clientGone = false;

        reply.raw.on('close', () => {
          clientGone = true;
          reader.cancel().catch(() => {});
        });

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

              if (!sseData || sseType === 'metadata' || sseType === 'end') continue;

              try {
                const parsed = JSON.parse(sseData);
                const uiChunk = translateMessageEvent(sseType, parsed, chunkId);
                if (uiChunk) {
                  reply.raw.write(`data: ${JSON.stringify(uiChunk)}\n\n`);
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
          fastify.log.info({ traceId, chunkId }, 'Stream complete');
          reply.raw.write('data: [DONE]\n\n');
          reply.raw.end();
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
      const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
      const path = (request.params as any)['*'];
      const session = request.session;
      const accessToken = session?.token?.access_token;

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

      try {
        const agentUrl = `${agentHost}/${path}`;
        fastify.log.info({ traceId, method: request.method, agentUrl }, 'Proxying request to agent');

        const fetchOptions: RequestInit = {
          method: request.method,
          headers,
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
        return reply.send(responseBody);
      } catch (error) {
        fastify.log.error({ traceId, error }, 'Proxy error');
        return reply.status(502).send({ error: 'Failed to connect to agent service' });
      }
    }
  );

  fastify.post('/proxy/agent/feedback', async (request, reply) => {
    const traceId = (request.headers['x-trace-id'] as string) || randomUUID();
    const session = request.session;
    const accessToken = session?.token?.access_token;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Trace-ID': traceId,
    };

    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const agentUrl = `${agentHost}/feedback`;
      const agentResponse = await fetch(agentUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(request.body),
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
      const agentResponse = await fetch(`${agentHost}/ok`, {
        signal: AbortSignal.timeout(5000),
      });
      return reply.send({
        status: agentResponse.ok ? 'healthy' : 'unhealthy',
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
    const session = request.session;
    const accessToken = session?.token?.access_token;

    if (!accessToken && process.env.AUTH_ENABLED === 'true') {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    return reply.send({ token: accessToken || '' });
  });
}

export { proxyRoutes };
