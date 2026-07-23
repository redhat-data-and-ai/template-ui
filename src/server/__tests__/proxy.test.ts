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
});
