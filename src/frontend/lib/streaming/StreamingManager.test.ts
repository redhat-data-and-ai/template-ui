import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StreamingManager } from './StreamingManager';
import type { StreamCallback } from './StreamingManager';
import { markChatAsClientCreated, isClientCreatedChat } from '@/services/newChatTracker';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTokenSSE(content: string, chunkId: number): string {
  return `data: ${JSON.stringify({ type: 'token', content, chunk_id: chunkId })}\n\n`;
}

function makeInterruptSSE(value: object | string, chunkId: number): string {
  return `data: ${JSON.stringify({
    type: 'interrupt',
    content: { value, resumable: true },
    chunk_id: chunkId,
  })}\n\n`;
}

function makeStreamResponse(sseBody: string): Response {
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

function makeCallbacks(overrides: Partial<StreamCallback> = {}): StreamCallback {
  return {
    onToken: vi.fn(),
    onMessage: vi.fn(),
    onInterrupt: vi.fn(),
    onError: vi.fn(),
    onDone: vi.fn(),
    onStatusChange: vi.fn(),
    onMcpStatus: vi.fn(),
    onMetadata: vi.fn(),
    ...overrides,
  };
}

const BASE_REQUEST = {
  message: 'hello',
  threadId: 'thread-1',
  userId: 'user-1',
  apiUrl: 'http://localhost:8080/api/proxy/agent',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('StreamingManager', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Happy path: token + done ───────────────────────────────────────────────
  it('calls onToken then onDone for a normal stream', async () => {
    const sseBody = makeTokenSSE('Hello', 0) + 'data: [DONE]\n\n';
    vi.mocked(fetch).mockResolvedValueOnce(makeStreamResponse(sseBody));

    const callbacks = makeCallbacks();
    const manager = new StreamingManager();
    await manager.stream(BASE_REQUEST, callbacks);

    expect(callbacks.onToken).toHaveBeenCalledWith('Hello');
    expect(callbacks.onDone).toHaveBeenCalledOnce();
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  // ── Status transitions: connecting → streaming → idle ────────────────────
  it('emits connecting → streaming → idle status changes', async () => {
    const sseBody = makeTokenSSE('Hi', 0) + 'data: [DONE]\n\n';
    vi.mocked(fetch).mockResolvedValueOnce(makeStreamResponse(sseBody));

    const statuses: string[] = [];
    const callbacks = makeCallbacks({ onStatusChange: (s) => statuses.push(s) });
    const manager = new StreamingManager();
    await manager.stream(BASE_REQUEST, callbacks);

    expect(statuses).toContain('connecting');
    expect(statuses).toContain('streaming');
    expect(statuses).toContain('idle');
  });

  // ── Interrupt chunk → onInterrupt called ─────────────────────────────────
  it('calls onInterrupt when an interrupt chunk arrives', async () => {
    const interruptValue = {
      action_requests: [{ name: 'create_pr', args: {} }],
      review_configs: [{ action_name: 'create_pr', allowed_decisions: ['approve', 'reject'] }],
    };
    const sseBody = makeInterruptSSE(interruptValue, 0) + 'data: [DONE]\n\n';
    vi.mocked(fetch).mockResolvedValueOnce(makeStreamResponse(sseBody));

    const callbacks = makeCallbacks();
    const manager = new StreamingManager();
    await manager.stream(BASE_REQUEST, callbacks);

    expect(callbacks.onInterrupt).toHaveBeenCalledOnce();
    const [payload] = vi.mocked(callbacks.onInterrupt).mock.calls[0];
    expect(payload.resumable).toBe(true);
    expect(payload.value).toMatchObject(interruptValue);
  });

  // ── Duplicate chunk_id deduplication ─────────────────────────────────────
  it('ignores a chunk with a duplicate chunk_id', async () => {
    const sseBody =
      makeTokenSSE('First', 5) +
      makeTokenSSE('Duplicate', 5) + // same chunk_id
      'data: [DONE]\n\n';
    vi.mocked(fetch).mockResolvedValueOnce(makeStreamResponse(sseBody));

    const callbacks = makeCallbacks();
    const manager = new StreamingManager();
    await manager.stream(BASE_REQUEST, callbacks);

    expect(callbacks.onToken).toHaveBeenCalledTimes(1);
    expect(callbacks.onToken).toHaveBeenCalledWith('First');
  });

  // ── HTTP error → onError + status 'error' ────────────────────────────────
  it('calls onError and emits error status for a non-2xx response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const statuses: string[] = [];
    const callbacks = makeCallbacks({ onStatusChange: (s) => statuses.push(s) });
    const manager = new StreamingManager();
    await manager.stream(BASE_REQUEST, callbacks);

    expect(callbacks.onError).toHaveBeenCalledOnce();
    expect(statuses).toContain('error');
  });

  // ── cancel() → AbortError → status 'cancelled' ───────────────────────────
  it('emits cancelled status when cancel() is called during stream', async () => {
    vi.mocked(fetch).mockImplementationOnce(
      (_url, opts) =>
        new Promise<Response>((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            const err = new Error('Aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );

    const statuses: string[] = [];
    const callbacks = makeCallbacks({ onStatusChange: (s) => statuses.push(s) });
    const manager = new StreamingManager();

    const streamPromise = manager.stream(BASE_REQUEST, callbacks);
    manager.cancel();
    await streamPromise;

    expect(statuses).toContain('cancelled');
    expect(callbacks.onError).not.toHaveBeenCalled();
  });

  // ── getStatus() reflects current state ───────────────────────────────────
  it('getStatus() returns idle before and after a completed stream', async () => {
    const sseBody = makeTokenSSE('Hi', 0) + 'data: [DONE]\n\n';
    vi.mocked(fetch).mockResolvedValueOnce(makeStreamResponse(sseBody));

    const manager = new StreamingManager();
    expect(manager.getStatus()).toBe('idle');
    await manager.stream(BASE_REQUEST, makeCallbacks());
    expect(manager.getStatus()).toBe('idle');
  });

  // ── Multiple tokens in one stream ────────────────────────────────────────
  it('calls onToken for each token chunk in the stream', async () => {
    const sseBody =
      makeTokenSSE('Hello', 0) +
      makeTokenSSE(' world', 1) +
      'data: [DONE]\n\n';
    vi.mocked(fetch).mockResolvedValueOnce(makeStreamResponse(sseBody));

    const callbacks = makeCallbacks();
    const manager = new StreamingManager();
    await manager.stream(BASE_REQUEST, callbacks);

    expect(callbacks.onToken).toHaveBeenCalledTimes(2);
    expect(vi.mocked(callbacks.onToken).mock.calls[0][0]).toBe('Hello');
    expect(vi.mocked(callbacks.onToken).mock.calls[1][0]).toBe(' world');
  });

  // ── No reader from response body ─────────────────────────────────────────
  it('calls onError when response body is null', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 200 }),
    );

    const callbacks = makeCallbacks();
    const manager = new StreamingManager();
    await manager.stream(BASE_REQUEST, callbacks);

    expect(callbacks.onError).toHaveBeenCalledOnce();
  });

  // ── Plain-string interrupt propagated to onInterrupt ─────────────────────
  it('propagates a plain-string interrupt value to onInterrupt', async () => {
    const sseBody = makeInterruptSSE('Approve this action?', 0) + 'data: [DONE]\n\n';
    vi.mocked(fetch).mockResolvedValueOnce(makeStreamResponse(sseBody));

    const callbacks = makeCallbacks();
    const manager = new StreamingManager();
    await manager.stream(BASE_REQUEST, callbacks);

    expect(callbacks.onInterrupt).toHaveBeenCalledOnce();
    const [payload] = vi.mocked(callbacks.onInterrupt).mock.calls[0];
    expect(payload.resumable).toBe(true);
    expect(payload.value).toBe('Approve this action?');
  });

  // ── cancel() between streams resets state ────────────────────────────────
  // Note: tests that cancel() on an idle manager resets the chunk ID set,
  // allowing the same IDs to be reused in a subsequent stream.
  it('cancel() resets processedChunkIds so next stream can use the same ids', async () => {
    const sseBody = makeTokenSSE('Re-used', 0) + 'data: [DONE]\n\n';
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeStreamResponse(sseBody))
      .mockResolvedValueOnce(makeStreamResponse(sseBody));

    const manager = new StreamingManager();
    const cb1 = makeCallbacks();
    await manager.stream(BASE_REQUEST, cb1);
    manager.cancel();

    const cb2 = makeCallbacks();
    await manager.stream(BASE_REQUEST, cb2);

    // chunk_id 0 was used in first stream; after cancel+reset it should work again
    expect(cb2.onToken).toHaveBeenCalledWith('Re-used');
  });

  it('includes project_id in the stream request body when provided', async () => {
    const sseBody = makeTokenSSE('Hi', 0) + 'data: [DONE]\n\n';
    vi.mocked(fetch).mockResolvedValueOnce(makeStreamResponse(sseBody));

    const manager = new StreamingManager();
    await manager.stream({ ...BASE_REQUEST, projectId: 'proj-1' }, makeCallbacks());

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.project_id).toBe('proj-1');
  });

  it('unmarks a client-created chat after the stream HTTP response succeeds', async () => {
    markChatAsClientCreated('thread-1');
    const sseBody = makeTokenSSE('Hi', 0) + 'data: [DONE]\n\n';
    vi.mocked(fetch).mockResolvedValueOnce(makeStreamResponse(sseBody));

    const manager = new StreamingManager();
    await manager.stream(BASE_REQUEST, makeCallbacks());

    expect(isClientCreatedChat('thread-1')).toBe(false);
  });
});
