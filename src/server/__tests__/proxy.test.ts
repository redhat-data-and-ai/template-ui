import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestServer } from './test-utils.js';
import { resetSettings } from '../utils/settings.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeSSEResponse(sseBody: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(sseBody));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/** Stub fetch with sequential responses. Unstubs in afterEach. */
function stubFetch(...responses: Response[]) {
  const mock = vi.fn();
  let idx = 0;
  mock.mockImplementation(() => {
    const resp = responses[idx] ?? okJson({});
    idx++;
    return Promise.resolve(resp);
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  process.env.FEATURE_AUTH_ENABLED = 'false';
  // auth-check.plugin.ts reads AUTH_ENABLED (legacy) to bypass session auth.
  // Without this, the preHandler hook redirects all /api/proxy/* requests to /login.
  process.env.AUTH_ENABLED = 'false';
  process.env.AGENT_HOST = 'http://127.0.0.1:19999';
  resetSettings();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AGENT_HOST;
  delete process.env.AUTH_ENABLED;
  resetSettings();
});

// ── GET /api/health/agent ─────────────────────────────────────────────────────

describe('GET /api/health/agent', () => {
  it('returns status from the agent when the agent is healthy', async () => {
    stubFetch(okJson({ status: 'healthy' }));

    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/health/agent' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('healthy');
  });

  it('returns status "unreachable" when the agent fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')));

    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/health/agent' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('unreachable');
  });

  it('returns "unhealthy" when the agent returns a non-2xx status', async () => {
    stubFetch(new Response('Service Unavailable', { status: 503 }));

    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/health/agent' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('unhealthy');
  });
});

// ── GET /api/health (BFF health) ─────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 ok without contacting the agent', async () => {
    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
  });
});

// ── GET /api/config/branding ──────────────────────────────────────────────────

describe('GET /api/config/branding', () => {
  it('returns branding config from settings', async () => {
    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/config/branding' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('title');
    expect(body).toHaveProperty('colors');
  });
});

// ── GET /api/config/features ──────────────────────────────────────────────────

describe('GET /api/config/features', () => {
  it('returns feature flags from settings', async () => {
    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/config/features' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('auth_enabled');
  });
});

// ── POST /api/proxy/agent/mcp/:mcpName/* MCP Apps host proxy ─────────────────

describe('POST /api/proxy/agent/mcp/:mcpName/resources/read', () => {
  it('forwards any resource uri to the agent with Authorization', async () => {
    const mockFetch = stubFetch(okJson({ contents: [{ text: '{"ok":true}' }] }));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/mcp/charts/resources/read',
      payload: { uri: 'showcase://sample.json' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).contents[0].text).toBe('{"ok":true}');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [agentUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toBe('http://127.0.0.1:19999/mcp/charts/resources/read');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ uri: 'showcase://sample.json' });
  });

  it('rejects empty uris without calling the agent', async () => {
    const mockFetch = stubFetch(okJson({}));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/mcp/charts/resources/read',
      payload: { uri: '' },
    });

    expect(res.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('POST /api/proxy/agent/mcp/:mcpName/resources/list', () => {
  it('forwards list to the agent', async () => {
    const mockFetch = stubFetch(okJson({ resources: [{ uri: 'showcase://sample.json' }] }));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/mcp/charts/resources/list',
      payload: { cursor: 'abc' },
    });

    expect(res.statusCode).toBe(200);
    const [agentUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toBe('http://127.0.0.1:19999/mcp/charts/resources/list');
    expect(JSON.parse(String(init.body))).toEqual({ cursor: 'abc' });
  });
});

describe('POST /api/proxy/agent/mcp/:mcpName/resources/templates/list', () => {
  it('forwards templates list to the agent', async () => {
    const mockFetch = stubFetch(
      okJson({ resourceTemplates: [{ uriTemplate: 'showcase://{id}' }] }),
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/mcp/charts/resources/templates/list',
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const [agentUrl] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toBe('http://127.0.0.1:19999/mcp/charts/resources/templates/list');
  });
});

describe('POST /api/proxy/agent/mcp/:mcpName/tools/call', () => {
  it('forwards app tool calls to the agent', async () => {
    const mockFetch = stubFetch(
      okJson({ content: [{ type: 'text', text: 'ok' }], structuredContent: { n: 1 } }),
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/mcp/charts/tools/call',
      payload: { name: 'refresh_showcase', arguments: { topic: 'demo' } },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).structuredContent).toEqual({ n: 1 });
    const [agentUrl, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toBe('http://127.0.0.1:19999/mcp/charts/tools/call');
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'refresh_showcase',
      arguments: { topic: 'demo' },
    });
  });

  it('rejects missing tool name without calling the agent', async () => {
    const mockFetch = stubFetch(okJson({}));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/mcp/charts/tools/call',
      payload: { arguments: {} },
    });

    expect(res.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── ALL /api/proxy/agent/* generic pass-through ───────────────────────────────

describe('ALL /api/proxy/agent/* (generic pass-through)', () => {
  it('proxies a GET to the agent and forwards the response', async () => {
    stubFetch(okJson({ messages: [], tasks: [] }));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/proxy/agent/threads/my-thread/state',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toHaveProperty('messages');
  });

  it('forwards a 404 from the agent as-is', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('Not Found', { status: 404 })),
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/proxy/agent/threads/nonexistent/state',
    });

    expect(res.statusCode).toBe(404);
  });

  it('returns 502 when the agent is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/proxy/agent/threads/t1/state',
    });

    expect(res.statusCode).toBe(502);
  });
});

// ── Thread state LRU cache ────────────────────────────────────────────────────

describe('GET /api/proxy/agent/threads/:id/state — LRU cache', () => {
  it('returns X-Cache: MISS on the first request', async () => {
    stubFetch(okJson({ messages: [], tasks: [] }));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/proxy/agent/threads/cache-thread-1/state',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['x-cache']).toBe('MISS');
  });

  it('returns X-Cache: HIT and avoids a second fetch on a repeated request', async () => {
    const mockFetch = stubFetch(
      okJson({ messages: [], tasks: [] }), // only needed once
    );

    const server = await buildTestServer();
    // First request
    await server.inject({
      method: 'GET',
      url: '/api/proxy/agent/threads/cache-thread-2/state',
    });
    // Second request — should hit cache
    const res2 = await server.inject({
      method: 'GET',
      url: '/api/proxy/agent/threads/cache-thread-2/state',
    });

    expect(res2.headers['x-cache']).toBe('HIT');
    // fetch was only called once (not twice)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

// ── POST /api/proxy/agent/feedback ───────────────────────────────────────────

describe('POST /api/proxy/agent/feedback', () => {
  it('proxies the feedback to the agent and returns the result', async () => {
    stubFetch(okJson({ success: true }));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/feedback',
      payload: { run_id: 'run-1', score: 1, comment: 'Good' },
    });

    expect(res.statusCode).toBe(200);
  });

  it('returns 502 when the agent is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/feedback',
      payload: { run_id: 'run-1', score: 1 },
    });

    expect(res.statusCode).toBe(502);
  });
});

// ── Public routes remain accessible without auth ──────────────────────────────

describe('Public /api routes — accessible without auth', () => {
  it('GET /api/health returns 200 when AUTH_ENABLED=true and no session', async () => {
    process.env.AUTH_ENABLED = 'true';
    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).status).toBe('ok');
  });

  it('GET /api/config/branding returns 200 when AUTH_ENABLED=true and no session', async () => {
    process.env.AUTH_ENABLED = 'true';
    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/config/branding' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('title');
  });

  it('GET /api/config/features returns 200 when AUTH_ENABLED=true and no session', async () => {
    process.env.AUTH_ENABLED = 'true';
    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/config/features' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toHaveProperty('auth_enabled');
  });
});

// ── GET /api/me — session identity for Vite SPA ───────────────────────────────

describe('GET /api/me', () => {
  it('returns the dummy-session username when AUTH_ENABLED=false', async () => {
    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.preferred_username).toBe('johnwick');
    expect(body.displayName).toBe('John');
  });

  it('returns 401 when AUTH_ENABLED=true and no session exists', async () => {
    process.env.AUTH_ENABLED = 'true';
    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe('unauthenticated');
  });
});

// ── authCheck — preferred_username resolution via x-auth headers ──────────────
//
// These tests exercise the actual authCheck preHandler (not a local copy of the
// logic) by injecting x-auth-* headers into the full server and asserting the
// X-User-ID forwarded to the upstream agent on every stream request.
//
// Stub order per request (AUTH_ENABLED=false, gwEmail set, x-token provided):
//   [0] consent check  → { has_consent: true }
//   [1] POST /threads  → { thread_id }   ← X-User-ID asserted here
//   [2] POST /runs/stream → SSE body
//   [3] GET  /state    → { messages, tasks }

describe('authCheck — preferred_username resolution via x-auth headers', () => {
  const agentSSE = `event: messages/partial\ndata: [{"type":"ai","content":"ok"}]\n\n`;

  function streamStubs() {
    return [
      okJson({ has_consent: true }),
      okJson({ thread_id: 'th-uid' }),
      makeSSEResponse(agentSSE),
      okJson({ messages: [], tasks: [] }),
    ];
  }

  it('uses JWT preferred_username when token claim is present', async () => {
    const payload = { preferred_username: 'from-jwt', sub: 'sub-jwt' };
    const fakeJwt = `eyJhbGciOiJub25lIn0.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.`;

    const fetchMock = stubFetch(...streamStubs());
    const server = await buildTestServer();

    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      headers: {
        'x-auth-user-email': 'team+from-email@example.com',
        'x-auth-user-name': 'Test User',
        'x-auth-user-preferred-username': 'from-header',
        'x-auth-access-token': fakeJwt,
      },
      payload: { message: 'hi', thread_id: 'th-uid', user_id: 'ignored' },
    });

    expect(res.statusCode).toBe(200);
    // call[1] is POST /threads (call[0] is the consent check)
    expect(fetchMock.mock.calls[1][1].headers['X-User-ID']).toBe('from-jwt');
  });

  it('falls back to x-auth-user-preferred-username header when no JWT claim', async () => {
    const fetchMock = stubFetch(...streamStubs());
    const server = await buildTestServer();

    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      headers: {
        'x-auth-user-email': 'svc-team+svc-account@example.com',
        'x-auth-user-name': 'Svc Account',
        'x-auth-user-preferred-username': 'svc-account',
        'x-token': 'dummy-token',
      },
      payload: { message: 'hi', thread_id: 'th-uid', user_id: 'ignored' },
    });

    expect(res.statusCode).toBe(200);
    expect(fetchMock.mock.calls[1][1].headers['X-User-ID']).toBe('svc-account');
  });

  it('extracts uid after + from email local-part as last resort', async () => {
    const fetchMock = stubFetch(...streamStubs());
    const server = await buildTestServer();

    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      headers: {
        'x-auth-user-email': 'dataverse-agent-team+dataverse-agent-sa@example.com',
        'x-auth-user-name': 'Agent SA',
        'x-token': 'dummy-token',
      },
      payload: { message: 'hi', thread_id: 'th-uid', user_id: 'ignored' },
    });

    expect(res.statusCode).toBe(200);
    expect(fetchMock.mock.calls[1][1].headers['X-User-ID']).toBe('dataverse-agent-sa');
  });

  it('respects EMAIL_UID_SEPARATOR env var for underscore-separated emails', async () => {
    process.env.EMAIL_UID_SEPARATOR = '_';
    const fetchMock = stubFetch(...streamStubs());
    const server = await buildTestServer();

    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      headers: {
        'x-auth-user-email': 'svc-team_svc-account@example.com',
        'x-auth-user-name': 'Svc Account',
        'x-token': 'dummy-token',
      },
      payload: { message: 'hi', thread_id: 'th-uid', user_id: 'ignored' },
    });

    delete process.env.EMAIL_UID_SEPARATOR;
    expect(res.statusCode).toBe(200);
    expect(fetchMock.mock.calls[1][1].headers['X-User-ID']).toBe('svc-account');
  });

  it('uses email local-part for plain email (no + separator)', async () => {
    const fetchMock = stubFetch(...streamStubs());
    const server = await buildTestServer();

    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      headers: {
        'x-auth-user-email': 'alice@example.com',
        'x-auth-user-name': 'Alice',
        'x-token': 'dummy-token',
      },
      payload: { message: 'hi', thread_id: 'th-uid', user_id: 'ignored' },
    });

    expect(res.statusCode).toBe(200);
    expect(fetchMock.mock.calls[1][1].headers['X-User-ID']).toBe('alice');
  });

  it('uses prefix before + when suffix is empty (trailing + edge case)', async () => {
    const fetchMock = stubFetch(...streamStubs());
    const server = await buildTestServer();

    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      headers: {
        'x-auth-user-email': 'alice+@example.com',
        'x-auth-user-name': 'Alice',
        'x-token': 'dummy-token',
      },
      payload: { message: 'hi', thread_id: 'th-uid', user_id: 'ignored' },
    });

    expect(res.statusCode).toBe(200);
    expect(fetchMock.mock.calls[1][1].headers['X-User-ID']).toBe('alice');
  });
});

// ── POST /api/v1/stream — auth guard ─────────────────────────────────────────

describe('POST /api/v1/stream — auth guard', () => {
  it('redirects to /login when AUTH_ENABLED=true and no session exists', async () => {
    process.env.AUTH_ENABLED = 'true';

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', session_id: 's1', user_id: 'u1' },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toContain('/login');
  });

  it('proxies the request when AUTH_ENABLED=false (gateway mode)', async () => {
    const agentSSE = 'data: hello\n\n[DONE]\n\n';
    stubFetch(makeSSEResponse(agentSSE));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', session_id: 's1', user_id: 'u1' },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ── GET /api/v1/history/:threadId — auth guard ────────────────────────────────

describe('GET /api/v1/history/:threadId — auth guard', () => {
  it('redirects to /login when AUTH_ENABLED=true and no session exists', async () => {
    process.env.AUTH_ENABLED = 'true';

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/history/thread-abc',
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers['location']).toContain('/login');
  });

  it('proxies to agent and returns history when AUTH_ENABLED=false', async () => {
    stubFetch(okJson([{ role: 'user', content: 'hi' }]));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/history/thread-abc',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(Array.isArray(body)).toBe(true);
  });

  it('propagates agent error status when auth passes', async () => {
    stubFetch(new Response('Not Found', { status: 404 }));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/history/nonexistent-thread',
    });

    expect(res.statusCode).toBe(404);
  });
});

// ── POST /api/proxy/agent/v1/stream — HITL interrupt translation ──────────────

describe('POST /api/proxy/agent/v1/stream', () => {
  it('returns 200 and emits [DONE] for a simple token stream', async () => {
    const agentSSE =
      `event: messages/partial\ndata: [{"type":"ai","content":"Hello"}]\n\n`;

    stubFetch(
      okJson({ thread_id: 'th1' }),         // POST /threads
      makeSSEResponse(agentSSE),            // POST /threads/th1/runs/stream
      okJson({ messages: [], tasks: [] }),  // GET /threads/th1/state
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'u1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('[DONE]');
  });

  it('forwards dummy-session username as X-User-ID and run config user_id', async () => {
    const agentSSE =
      `event: messages/partial\ndata: [{"type":"ai","content":"Hello"}]\n\n`;

    const fetchMock = stubFetch(
      okJson({ thread_id: 'th1' }),
      makeSSEResponse(agentSSE),
      okJson({ messages: [], tasks: [] }),
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'ignored' },
    });

    expect(res.statusCode).toBe(200);

    const threadInit = fetchMock.mock.calls[0];
    const runInit = fetchMock.mock.calls[1];
    expect(threadInit[1].headers['X-User-ID']).toBe('johnwick');
    expect(JSON.parse(threadInit[1].body).metadata.user_identity).toBe('johnwick');
    const runBody = JSON.parse(runInit[1].body);
    expect(runBody.config.metadata.user_id).toBe('johnwick');
    expect(runBody.config.configurable.user_id).toBe('johnwick');
  });

  it('emits a token chunk when the agent sends messages/partial', async () => {
    const agentSSE =
      `event: messages/partial\ndata: [{"type":"ai","content":"Hi there"}]\n\n`;

    stubFetch(
      okJson({ thread_id: 'th2' }),
      makeSSEResponse(agentSSE),
      okJson({ messages: [], tasks: [] }),
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th2', user_id: 'u1' },
    });

    expect(res.body).toContain('"type":"token"');
    expect(res.body).toContain('Hi there');
  });

  it('translates a LangGraph __interrupt__ update into an interrupt chunk', async () => {
    const interruptValue = {
      action_requests: [{ name: 'github_create_pr', args: { title: 'My PR' } }],
      review_configs: [{ action_name: 'github_create_pr', allowed_decisions: ['approve', 'reject'] }],
    };
    const agentSSE =
      `event: updates\ndata: ${JSON.stringify({ __interrupt__: [{ value: interruptValue, resumable: true }] })}\n\n`;

    stubFetch(
      okJson({ thread_id: 'th3' }),
      makeSSEResponse(agentSSE),
      okJson({ messages: [], tasks: [] }),
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th3', user_id: 'u1' },
    });

    expect(res.body).toContain('"type":"interrupt"');
    expect(res.body).toContain('github_create_pr');
  });

  it('emits an interrupt chunk from thread state when missing from the stream', async () => {
    const interruptValue = { action_requests: [], review_configs: [] };
    // No __interrupt__ in the stream itself
    const agentSSE =
      `event: messages/partial\ndata: [{"type":"ai","content":"Processing..."}]\n\n`;

    // Thread state returns an interrupt in tasks
    const threadState = {
      messages: [],
      tasks: [{ interrupts: [{ value: interruptValue }] }],
    };

    stubFetch(
      okJson({ thread_id: 'th4' }),
      makeSSEResponse(agentSSE),
      okJson(threadState),
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th4', user_id: 'u1' },
    });

    expect(res.body).toContain('"type":"interrupt"');
  });

  it('returns 500 when thread creation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(new Response('error', { status: 500 })),
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th5', user_id: 'u1' },
    });

    expect(res.statusCode).toBe(500);
  });

  it('returns 503 when the agent SSE stream request itself fails', async () => {
    // Step 1 (thread creation) succeeds; step 2 (SSE stream) returns 503
    stubFetch(
      okJson({ thread_id: 'th6' }),
      new Response('Service Unavailable', { status: 503 }),
    );

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th6', user_id: 'u1' },
    });

    // The proxy must propagate the upstream 503 — not silently return 200
    expect(res.statusCode).toBe(503);
  });

  it('forwards project_id into thread metadata without run configurable', async () => {
    const agentSSE =
      `event: messages/partial\ndata: [{"type":"ai","content":"Hello"}]\n\n`;
    const mock = stubFetch(
      okJson({ thread_id: 'th-proj' }),
      makeSSEResponse(agentSSE),
      okJson({ messages: [], tasks: [] }),
    );

    const server = await buildTestServer();
    await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: {
        message: 'hello',
        thread_id: 'th-proj',
        user_id: 'u1',
        project_id: 'proj-1',
      },
    });

    const threadBody = JSON.parse(mock.mock.calls[0][1].body as string);
    expect(threadBody.metadata.project_id).toBe('proj-1');
    expect(threadBody.ifExists).toBe('do_nothing');
    const runBody = JSON.parse(mock.mock.calls[1][1].body as string);
    expect(runBody.config.configurable?.project_id).toBeUndefined();
  });

  it('rejects non-string project_id without calling the agent', async () => {
    const mock = stubFetch(okJson({}));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: {
        message: 'hello',
        thread_id: 'th-proj',
        user_id: 'u1',
        project_id: { foo: 1 },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('project_id must be a string when provided');
    expect(mock).not.toHaveBeenCalled();
  });
});


describe('interrupt identity transport', () => {
  it('emits all stream interrupts and adds fallback interrupts without duplicates', async () => {
    const a = {id:'a'.repeat(32),value:'Approve A',resumable:true};
    const b = {id:'b'.repeat(32),value:'Approve B',resumable:true};
    const c = {id:'c'.repeat(32),value:'Approve C',resumable:true};
    stubFetch(okJson({}),makeSSEResponse(`event: updates\ndata: ${JSON.stringify({__interrupt__:[a,b]})}\n\n`),okJson({tasks:[{interrupts:[a]},{interrupts:[b,c]}]}));
    const server = await buildTestServer();
    const response = await server.inject({method:'POST',url:'/api/proxy/agent/v1/stream',payload:{message:'hello',thread_id:'multi-transport'}});
    const chunks = response.body.split('\n').filter(line=>line.startsWith('data: {')).map(line=>JSON.parse(line.slice(6))).filter(chunk=>chunk.type==='interrupt');
    expect(chunks.map(chunk=>chunk.content)).toEqual([a,b,c]);
    await server.close();
  });

  it('forwards an interrupt-keyed resume unchanged', async () => {
    const resume = {['a'.repeat(32)]:{decisions:[{type:'approve'}]}};
    const mock = stubFetch(okJson({}),makeSSEResponse(''),okJson({tasks:[]}));
    const server = await buildTestServer();
    const response = await server.inject({method:'POST',url:'/api/proxy/agent/v1/stream',payload:{resume:true,message:resume,thread_id:'keyed-resume'}});
    expect(response.statusCode).toBe(200);
    const runCall = mock.mock.calls.find(([url])=>String(url).endsWith('/runs/stream'))!;
    expect(JSON.parse(runCall[1].body).command).toEqual({resume});
    await server.close();
  });
});
