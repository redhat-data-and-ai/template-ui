import { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { getSettings } from '../utils/settings.js';
import authCheckPlugin from '../plugins/auth-check.plugin.js';
import {
  resolveXUserId,
  ensureFreshTokens,
  sessionExpiredReply,
  getAgentHost,
  buildForwardedQueryString,
} from '../adapters/shared.js';
import { langgraphAdapter } from '../adapters/langgraph.adapter.js';
import { simpleRestAdapter } from '../adapters/simple-rest.adapter.js';
import type { AgentAdapter, StreamRequestBody } from '../adapters/types.js';

/**
 * BFF proxy — translates the UI's fixed backend contract (SSE chunk stream,
 * thread search/state/delete/feedback shapes) onto whatever wire protocol
 * the configured agent engine actually speaks, via the adapter selected by
 * `agent.protocol` in `../utils/settings.ts`.
 *
 * This router owns route registration, auth, and the small set of
 * protocol-agnostic pass-throughs (MCP Apps host, generic catch-all, health
 * check, one-time-token). All protocol-specific translation lives in
 * `../adapters/*.adapter.ts` — see `../adapters/types.ts` for the interface
 * and `docs/deployment-patterns.md` for how to add a new engine.
 */
function selectAdapter(): AgentAdapter {
  const cfg = getSettings();
  return cfg.agent.protocol === 'simple-rest' ? simpleRestAdapter : langgraphAdapter;
}

async function proxyRoutes(fastify: FastifyInstance) {
  await fastify.register(authCheckPlugin);

  const adapter = selectAdapter();
  fastify.log.info({ protocol: getSettings().agent.protocol }, 'Agent adapter selected');

  fastify.removeContentTypeParser('application/json');
  fastify.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 1048576 }, (req, body, done) => {
    if (!body || (typeof body === 'string' && body.trim() === '')) {
      done(null, undefined);
    } else {
      try { done(null, JSON.parse(body as string)); } catch (err) { done(err as Error, undefined); }
    }
  });

  /** Streaming endpoint — translates the UI's {message, thread_id, ...} payload via the selected adapter. */
  fastify.post<{ Body: StreamRequestBody }>(
    '/proxy/agent/v1/stream',
    (request, reply) => adapter.handleStream(fastify, request, reply),
  );

  fastify.post('/proxy/agent/threads/search', (request, reply) => adapter.searchThreads(fastify, request, reply));

  fastify.get<{ Params: { threadId: string } }>(
    '/proxy/agent/threads/:threadId/state',
    (request, reply) => adapter.getThreadState(fastify, request, reply),
  );

  fastify.delete<{ Params: { threadId: string } }>(
    '/proxy/agent/threads/:threadId',
    (request, reply) => adapter.deleteThread(fastify, request, reply),
  );

  fastify.post('/proxy/agent/feedback', (request, reply) => adapter.submitFeedback(fastify, request, reply));

  fastify.get<{ Params: { threadId: string } }>(
    '/proxy/agent/feedback/:threadId',
    (request, reply) => {
      if (adapter.getThreadFeedback) {
        return adapter.getThreadFeedback(fastify, request, reply);
      }
      return reply.send({ feedback: [] });
    },
  );

  /** Forward a JSON request to the agent with refreshed session tokens (protocol-agnostic pass-through). */
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
  // Only meaningful for engines that expose an MCP surface (LangGraph/Aegra);
  // deployments on a simple-rest agent should set features.mcp_apps_enabled=false
  // so the frontend never calls these.
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

  // Generic pass-through for anything not handled by an explicit route above
  // (e.g. LangGraph's MCP oauth connect/status). Adapters translate the
  // routes that need protocol-specific shaping; this catch-all stays a blind
  // forward for the rest.
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

        return reply.send(await agentResponse.text());
      } catch (error) {
        fastify.log.error({ traceId, err: error }, 'Proxy error');
        return reply.status(502).send({ error: 'Failed to connect to agent service' });
      }
    },
  );

  fastify.get('/health/agent', async (_request, reply) => {
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
