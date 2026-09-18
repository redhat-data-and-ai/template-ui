import { randomUUID } from 'node:crypto';
import { FastifyInstance, FastifyReply } from 'fastify';
import { getSettings } from '../utils/settings.js';
import { resolveXUserIdFromSession } from '../utils/session-identity.js';

/**
 * Helpers shared by every agent-protocol adapter (`./langgraph.adapter.ts`,
 * `./simple-rest.adapter.ts`) and by `../router/proxy.router.ts`. None of this
 * is protocol-specific — it's the same auth/token/caching/proxy plumbing
 * regardless of which agent engine is on the other end.
 */

export function getAgentHost(): string {
  const cfg = getSettings();
  return cfg.agent.endpoint || process.env.AGENT_HOST || "http://localhost:5002";
}

/** Identity forwarded to the agent — same as prod: session username, else ``default``. */
export function resolveXUserId(request: { session?: { user?: { preferred_username?: string; sub?: string; email?: string }; token?: { access_token?: string; id_token?: string } } }): string {
  return resolveXUserIdFromSession(request.session);
}

/**
 * In-memory LRU cache for thread state responses (avoids repeated agent-side
 * deserialization). Keyed by `${userId}:${threadId}`, never by `threadId`
 * alone — thread IDs are not secret, so an unscoped cache would let one
 * authenticated session read a HIT containing another user's cached thread
 * state. Callers MUST resolve and authenticate the caller (e.g. via
 * `ensureFreshTokens` + `resolveXUserId`) *before* checking the cache.
 */
const THREAD_STATE_CACHE = new Map<string, { body: string; ts: number }>();
const CACHE_TTL_MS = 3_000; // 3s — short TTL for recovery polling compatibility
const CACHE_MAX_ENTRIES = 50;

function threadStateCacheKey(userId: string, threadId: string): string {
  // Encode each component independently before joining: userId (derived from
  // preferred_username/sub, which are IdP-controlled) and threadId (an
  // unvalidated route param) could otherwise both contain the ':' separator,
  // letting (userId="a:b", threadId="c") and (userId="a", threadId="b:c")
  // collide on the same raw string key.
  return `${encodeURIComponent(userId)}:${encodeURIComponent(threadId)}`;
}

export function getCachedThreadState(userId: string, threadId: string): string | null {
  const key = threadStateCacheKey(userId, threadId);
  const entry = THREAD_STATE_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) {
    THREAD_STATE_CACHE.delete(key);
    return null;
  }
  return entry.body;
}

export function setCachedThreadState(userId: string, threadId: string, body: string): void {
  const key = threadStateCacheKey(userId, threadId);
  if (THREAD_STATE_CACHE.size >= CACHE_MAX_ENTRIES) {
    const oldest = THREAD_STATE_CACHE.keys().next().value;
    if (oldest) THREAD_STATE_CACHE.delete(oldest);
  }
  THREAD_STATE_CACHE.set(key, { body, ts: Date.now() });
}

/** Invalidate cache when a new run completes on a thread. */
export function invalidateThreadStateCache(userId: string, threadId: string): void {
  THREAD_STATE_CACHE.delete(threadStateCacheKey(userId, threadId));
}

export interface TokenPair {
  accessToken: string | null;
  refreshToken: string | null;
  refreshFailed?: boolean;
}

/**
 * Return a valid access + refresh token pair, refreshing via the SSO
 * plugin if the current access token is expired or about to expire
 * (30 s buffer). Saves the refreshed token set back into the session.
 *
 * The refresh_token is forwarded so the agent can do its own refresh
 * if the token expires while queued in the worker pipeline.
 */
export async function ensureFreshTokens(
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

export function sessionExpiredReply(reply: FastifyReply) {
  return reply.status(401).send({
    error: 'session_expired',
    message: 'Token refresh failed. Please log in again.',
  });
}

/** Forward client query string to the agent (e.g. GET /feedback/:id?user_id=...). */
export function buildForwardedQueryString(query: Record<string, unknown>): string {
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

/**
 * Forward a JSON request to the agent with refreshed session tokens.
 * Used by MCP Apps host routes and the generic /proxy/agent/* pass-through.
 */
export async function forwardJsonToAgent(
  fastify: FastifyInstance,
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
