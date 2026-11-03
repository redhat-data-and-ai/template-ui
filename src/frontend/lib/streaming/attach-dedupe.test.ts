import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StreamingManager } from './StreamingManager';

/**
 * Attaching to a run replays it from the first event, so a tab that
 * watched half a turn and then lost its connection would see that
 * half twice. These pin the manager's side of that contract: every
 * chunk is delivered once, with its message id, so the caller can
 * tell replay from new.
 */
function sseResponse(body: string) {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    }),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  );
}

describe('StreamingManager.attach', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('delivers replayed chunks with their message ids', async () => {
    const body =
      'data: {"type":"token","content":"Half ","chunk_id":1,"message_id":"m1"}\n\n' +
      'data: {"type":"token","content":"an answer","chunk_id":2,"message_id":"m1"}\n\n' +
      'data: [DONE]\n\n';
    vi.mocked(fetch).mockResolvedValue(sseResponse(body));

    const tokens: Array<[string, string | undefined]> = [];
    const manager = new StreamingManager();
    await manager.attach(
      { threadId: 't1', runId: 'r1' },
      {
        onToken: (c, id) => tokens.push([c, id]),
        onMessage: vi.fn(),
        onInterrupt: vi.fn(),
        onError: vi.fn(),
        onStatusChange: vi.fn(),
        onDone: vi.fn(),
      },
    );

    expect(tokens).toEqual([
      ['Half ', 'm1'],
      ['an answer', 'm1'],
    ]);
  });

  it('asks the server for the run it means to join', async () => {
    vi.mocked(fetch).mockResolvedValue(sseResponse('data: [DONE]\n\n'));

    const manager = new StreamingManager();
    await manager.attach(
      { threadId: 'th-9', runId: 'run-9' },
      {
        onToken: vi.fn(),
        onMessage: vi.fn(),
        onInterrupt: vi.fn(),
        onError: vi.fn(),
        onStatusChange: vi.fn(),
        onDone: vi.fn(),
      },
    );

    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      thread_id: 'th-9',
      run_id: 'run-9',
    });
  });

  it('reports a failed attach rather than pretending the turn ended', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('nope', { status: 404 }));

    const onError = vi.fn();
    const onDone = vi.fn();
    const manager = new StreamingManager();
    await manager.attach(
      { threadId: 't1', runId: 'gone' },
      {
        onToken: vi.fn(),
        onMessage: vi.fn(),
        onInterrupt: vi.fn(),
        onError,
        onStatusChange: vi.fn(),
        onDone,
      },
    );

    expect(onError).toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('StreamingManager.attach — never over a live stream', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  const noopCallbacks = () => ({
    onToken: vi.fn(),
    onMessage: vi.fn(),
    onInterrupt: vi.fn(),
    onError: vi.fn(),
    onStatusChange: vi.fn(),
    onDone: vi.fn(),
  });

  it('refuses to attach while this manager is already streaming', async () => {
    // Managers are per-thread singletons and attach used to cancel
    // first, so a rejoin on window focus killed the turn the tab was
    // watching: the subagent box froze on "Working" until a refresh.
    const manager = new StreamingManager();
    (manager as unknown as { status: string }).status = 'streaming';

    await manager.attach({ threadId: 't1', runId: 'r1' }, noopCallbacks());

    expect(fetch).not.toHaveBeenCalled();
    expect(manager.getStatus()).toBe('streaming');
  });

  it('refuses while the stream is still connecting', async () => {
    const manager = new StreamingManager();
    (manager as unknown as { status: string }).status = 'connecting';

    await manager.attach({ threadId: 't1', runId: 'r1' }, noopCallbacks());

    expect(fetch).not.toHaveBeenCalled();
  });

  it('attaches when the manager is idle', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));
            c.close();
          },
        }),
        { status: 200 },
      ),
    );

    const manager = new StreamingManager();
    await manager.attach({ threadId: 't1', runId: 'r1' }, noopCallbacks());

    expect(fetch).toHaveBeenCalled();
  });
});
