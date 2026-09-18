import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestServer } from './test-utils.js';
import { resetSettings } from '../utils/settings.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function okJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Simulate Harbor Agent's /v1/stream response: NDJSON, one object per line, terminated by a literal "[DONE]" line. */
function makeNdjsonResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(lines.join('\n') + '\n'));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

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
  process.env.AUTH_ENABLED = 'false';
  process.env.AGENT_HOST = 'http://127.0.0.1:19999';
  process.env.AGENT_PROTOCOL = 'simple-rest';
  resetSettings();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AGENT_HOST;
  delete process.env.AUTH_ENABLED;
  delete process.env.AGENT_PROTOCOL;
  resetSettings();
});

// ── POST /api/proxy/agent/v1/stream (simple-rest) ─────────────────────────────

describe('POST /api/proxy/agent/v1/stream — simple-rest adapter', () => {
  it('calls Harbor Agent /v1/stream directly (no thread-creation call)', async () => {
    const mock = stubFetch(makeNdjsonResponse(['{"type":"token","content":"Hi"}', '[DONE]']));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'u1' },
    });

    expect(res.statusCode).toBe(200);
    expect(mock).toHaveBeenCalledTimes(1);
    const [agentUrl] = mock.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toBe('http://127.0.0.1:19999/v1/stream');
  });

  it('translates a token event into a UI token chunk and ends with [DONE]', async () => {
    stubFetch(makeNdjsonResponse(['{"type":"token","content":"Hi there"}', '[DONE]']));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'u1' },
    });

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.body).toContain('"type":"token"');
    expect(res.body).toContain('Hi there');
    expect(res.body).toContain('[DONE]');
  });

  it('translates an ai message with tool_calls', async () => {
    const line = JSON.stringify({
      type: 'message',
      content: { type: 'ai', content: '', run_id: 'r1', tool_calls: [{ name: 'search', args: { q: 'x' } }] },
    });
    stubFetch(makeNdjsonResponse([line, '[DONE]']));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'u1' },
    });

    expect(res.body).toContain('"tool_calls"');
    expect(res.body).toContain('"search"');
  });

  it('translates a tool-result message', async () => {
    const line = JSON.stringify({ type: 'message', content: { type: 'tool', content: 'result text' } });
    stubFetch(makeNdjsonResponse([line, '[DONE]']));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'u1' },
    });

    expect(res.body).toContain('"type":"tool"');
    expect(res.body).toContain('result text');
  });

  it('translates a content_replace event into draft_discard + token', async () => {
    const lines = [
      '{"type":"token","content":"partial"}',
      '{"type":"content_replace","content":"final text"}',
      '[DONE]',
    ];
    stubFetch(makeNdjsonResponse(lines));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'u1' },
    });

    expect(res.body).toContain('"type":"draft_discard"');
    expect(res.body).toContain('final text');
  });

  it('translates an error event', async () => {
    const line = JSON.stringify({ type: 'error', content: { message: 'boom', recoverable: false } });
    stubFetch(makeNdjsonResponse([line, '[DONE]']));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'u1' },
    });

    expect(res.body).toContain('"type":"error"');
    expect(res.body).toContain('boom');
  });

  it('rejects resume requests without calling the agent (no HITL support)', async () => {
    const mock = stubFetch(okJson({}));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'approve', thread_id: 'th1', user_id: 'u1', resume: true },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('unsupported_operation');
    expect(mock).not.toHaveBeenCalled();
  });

  it('returns 502 when the agent is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'u1' },
    });

    expect(res.statusCode).toBe(502);
  });

  it('propagates a non-2xx status from the agent', async () => {
    stubFetch(new Response('Service Unavailable', { status: 503 }));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'u1' },
    });

    expect(res.statusCode).toBe(503);
  });
});

// ── POST /api/proxy/agent/threads/search — Harbor thread list mapping ────────

describe('POST /api/proxy/agent/threads/search — simple-rest adapter', () => {
  it('maps Harbor /v1/threads onto the thread-search shape the frontend expects', async () => {
    const mock = stubFetch(
      okJson([
        { thread_id: 't1', thread_title: 'My chat', thread_created_at: '2024-01-01', thread_updated_at: '2024-01-02' },
      ]),
    );

    const server = await buildTestServer();
    const res = await server.inject({ method: 'POST', url: '/api/proxy/agent/threads/search', payload: {} });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body).toEqual([
      { thread_id: 't1', metadata: { thread_name: 'My chat' }, created_at: '2024-01-01', updated_at: '2024-01-02' },
    ]);
    const [agentUrl, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toBe('http://127.0.0.1:19999/v1/threads');
    expect(init.method).toBe('GET');
  });
});

// ── GET /api/proxy/agent/threads/:id/state — Harbor history mapping ──────────

describe('GET /api/proxy/agent/threads/:id/state — simple-rest adapter', () => {
  it('maps Harbor /v1/history/:id onto { values: { messages }, tasks: [] }', async () => {
    const mock = stubFetch(
      okJson({ messages: [{ type: 'human', content: 'hi', tool_calls: [], tool_call_id: null, thread_id: 't1', session_id: 's1' }] }),
    );

    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/proxy/agent/threads/t1/state' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.tasks).toEqual([]);
    expect(body.values.messages).toHaveLength(1);
    expect(body.values.messages[0].content).toBe('hi');
    const [agentUrl] = mock.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toBe('http://127.0.0.1:19999/v1/history/t1');
  });
});

// ── DELETE /api/proxy/agent/threads/:id ───────────────────────────────────────

describe('DELETE /api/proxy/agent/threads/:id — simple-rest adapter', () => {
  it('forwards the delete to Harbor Agent', async () => {
    const mock = stubFetch(new Response(null, { status: 204 }));

    const server = await buildTestServer();
    const res = await server.inject({ method: 'DELETE', url: '/api/proxy/agent/threads/t1' });

    expect(res.statusCode).toBe(204);
    const [agentUrl, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toBe('http://127.0.0.1:19999/v1/threads/t1');
    expect(init.method).toBe('DELETE');
  });
});

// ── POST /api/proxy/agent/feedback — payload translation ──────────────────────

describe('POST /api/proxy/agent/feedback — simple-rest adapter', () => {
  it('maps the frontend feedback payload onto Harbor\'s {run_id, key, score} shape', async () => {
    const mock = stubFetch(okJson({ success: true }));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/feedback',
      payload: { trace_id: 'trace-1', name: 'thumbs-up', value: 5, thread_id: 't1', message_id: 'msg-1' },
    });

    expect(res.statusCode).toBe(200);
    const [agentUrl, init] = mock.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toBe('http://127.0.0.1:19999/v1/feedback');
    expect(JSON.parse(String(init.body))).toEqual({
      run_id: 'msg-1',
      key: 'human-feedback-stars',
      score: 5,
    });
  });
});

// ── GET /api/proxy/agent/feedback/:threadId — no retrieval API on Harbor ─────

describe('GET /api/proxy/agent/feedback/:threadId — simple-rest adapter', () => {
  it('returns an empty feedback list without calling the agent', async () => {
    const mock = stubFetch(okJson({}));

    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/proxy/agent/feedback/t1' });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ feedback: [] });
    expect(mock).not.toHaveBeenCalled();
  });
});

// ── Auth guard — search/state/delete/feedback must reject tokenless sessions ──
//
// Regression coverage: handleStream already rejected a missing access token
// when AUTH_ENABLED=true, but searchThreads, getThreadState, deleteThread, and
// submitFeedback did not, so they would forward requests to Harbor Agent
// without an Authorization header instead of rejecting the caller (CWE-862).

describe('simple-rest adapter — auth guard when AUTH_ENABLED=true and no token', () => {
  beforeEach(() => {
    process.env.AUTH_ENABLED = 'true';
    resetSettings();
  });

  it('POST /api/proxy/agent/threads/search returns 401 without calling the agent', async () => {
    const mock = stubFetch(okJson([]));
    const server = await buildTestServer();
    const res = await server.inject({ method: 'POST', url: '/api/proxy/agent/threads/search', payload: {} });

    expect(res.statusCode).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });

  it('GET /api/proxy/agent/threads/:id/state returns 401 without calling the agent', async () => {
    const mock = stubFetch(okJson({ messages: [] }));
    const server = await buildTestServer();
    const res = await server.inject({ method: 'GET', url: '/api/proxy/agent/threads/t1/state' });

    expect(res.statusCode).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });

  it('DELETE /api/proxy/agent/threads/:id returns 401 without calling the agent', async () => {
    const mock = stubFetch(new Response(null, { status: 204 }));
    const server = await buildTestServer();
    const res = await server.inject({ method: 'DELETE', url: '/api/proxy/agent/threads/t1' });

    expect(res.statusCode).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });

  it('POST /api/proxy/agent/feedback returns 401 without calling the agent', async () => {
    const mock = stubFetch(okJson({ success: true }));
    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/feedback',
      payload: { trace_id: 'trace-1', value: 5, thread_id: 't1' },
    });

    expect(res.statusCode).toBe(401);
    expect(mock).not.toHaveBeenCalled();
  });
});

// ── NDJSON buffer cap — must not trip on many complete small records ─────────

describe('POST /api/proxy/agent/v1/stream — NDJSON buffer cap edge case', () => {
  it('does not abort when one chunk contains many complete small records totaling over the cap', async () => {
    // Regression test: the cap used to be checked against the pre-split buffer,
    // so a single chunk full of complete (newline-terminated) small records
    // that together exceeded 1 MiB would spuriously abort the stream even
    // though no individual unterminated line was anywhere near the cap.
    const smallLine = JSON.stringify({ type: 'token', content: 'x' });
    // ~1 MiB+ of complete, newline-terminated lines delivered in a single chunk.
    const lineCount = Math.ceil((1024 * 1024) / (smallLine.length + 1)) + 100;
    const lines = Array.from({ length: lineCount }, () => smallLine);
    lines.push('[DONE]');

    stubFetch(makeNdjsonResponse(lines));

    const server = await buildTestServer();
    const res = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'u1' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).not.toContain('exceeded maximum buffer size');
    expect(res.body).toContain('[DONE]');
  });
});

// ── Adapter selection ──────────────────────────────────────────────────────────

describe('agent.protocol selection', () => {
  it('defaults to the langgraph adapter (thread-creation call) when AGENT_PROTOCOL is unset', async () => {
    delete process.env.AGENT_PROTOCOL;
    resetSettings();
    const mock = stubFetch(okJson({ thread_id: 'th1' }), new Response('error', { status: 500 }));

    const server = await buildTestServer();
    await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/v1/stream',
      payload: { message: 'hello', thread_id: 'th1', user_id: 'u1' },
    });

    // langgraph adapter always creates the thread first
    const [agentUrl] = mock.mock.calls[0] as [string, RequestInit];
    expect(agentUrl).toBe('http://127.0.0.1:19999/threads');
  });
});
