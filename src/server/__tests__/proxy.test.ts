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
