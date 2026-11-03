import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./authenticated-fetch', () => ({
  authenticatedFetch: vi.fn(),
}));

vi.mock('../lib/app-paths', () => ({
  buildAgentApiUrl: (path: string) => `/api/proxy/agent${path}`,
}));

import { authenticatedFetch } from './authenticated-fetch';
import {
  getAllThreadsByUserId,
  cancelRun,
  deleteThreads,
  listAllThreadIds,
  deleteThread,
  getInFlightRun,
  getThreadState,
  getThreadPendingInterrupt,
  getThreadStateAndInterrupt,
} from './agent-rest';

describe('agent-rest', () => {
  beforeEach(() => {
    vi.mocked(authenticatedFetch).mockReset();
    (window as any).USER_DATA = { accessToken: 'test-token' };
  });

  describe('getAllThreadsByUserId', () => {
    it('returns thread list on success', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify([
            { thread_id: 't1', metadata: { thread_name: 'Chat 1', project_id: 'p1' }, updated_at: '2024-01-01' },
            { thread_id: 't2', metadata: { thread_name: 'Chat 2' }, created_at: '2024-01-02' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await getAllThreadsByUserId('user1');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 't1',
        title: 'Chat 1',
        messages: [],
        updatedAt: '2024-01-01',
        project_id: 'p1',
      });
      expect(result[1].project_id).toBeNull();
    });

    it('filters out entries without thread_id', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(JSON.stringify([{ thread_id: 't1' }, { no_id: true }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const result = await getAllThreadsByUserId('user1');
      expect(result).toHaveLength(1);
    });

    it('returns empty array on network error', async () => {
      vi.mocked(authenticatedFetch).mockRejectedValue(new Error('network'));
      const result = await getAllThreadsByUserId('user1');
      expect(result).toEqual([]);
    });

    it('returns empty array on non-ok response', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 500 }));
      const result = await getAllThreadsByUserId('user1');
      expect(result).toEqual([]);
    });

    it('returns empty array on invalid JSON', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response('not json', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
      );
      const result = await getAllThreadsByUserId('user1');
      expect(result).toEqual([]);
    });

    it('returns empty array when response is not an array', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(JSON.stringify({ threads: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const result = await getAllThreadsByUserId('user1');
      expect(result).toEqual([]);
    });
  });

  describe('cancelRun / getInFlightRun', () => {
    const TID = '28f0a9db-30a8-45f4-8c25-efbe496e1e5d';
    const RID = '7c79dd23-44a6-4c18-b551-79189e8b1e2b';

    it('cancels a run explicitly, because disconnecting no longer does', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 200 }));

      expect(await cancelRun(TID, RID)).toBe(true);
      const [url, init] = vi.mocked(authenticatedFetch).mock.calls[0];
      expect(String(url)).toContain(`/threads/${TID}/runs/${RID}/cancel`);
      expect((init as RequestInit).method).toBe('POST');
    });

    it('treats an already-finished run as cancelled', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 404 }));
      expect(await cancelRun(TID, RID)).toBe(true);
    });

    it('does nothing without a run to cancel', async () => {
      expect(await cancelRun(TID, '')).toBe(false);
      expect(authenticatedFetch).not.toHaveBeenCalled();
    });

    it('finds the run still executing on a thread', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify([
            { run_id: 'old', status: 'success' },
            { run_id: RID, status: 'running' },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      expect(await getInFlightRun(TID)).toBe(RID);
    });

    it('reports nothing in flight when every run has finished', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(JSON.stringify([{ run_id: 'old', status: 'success' }]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      expect(await getInFlightRun(TID)).toBeNull();
    });

    it('is quiet when the agent cannot be reached', async () => {
      vi.mocked(authenticatedFetch).mockRejectedValue(new Error('offline'));
      expect(await getInFlightRun(TID)).toBeNull();
    });
  });

  describe('deleteThread', () => {
    const SERVER_ID = '28f0a9db-30a8-45f4-8c25-efbe496e1e5d';

    it('returns true on successful deletion', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 200 }));
      expect(await deleteThread(SERVER_ID)).toBe(true);
    });

    it('returns true on 404 (already gone)', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 404 }));
      expect(await deleteThread(SERVER_ID)).toBe(true);
    });

    it('returns false on other errors', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 500 }));
      expect(await deleteThread(SERVER_ID)).toBe(false);
    });

    it('returns false on network error', async () => {
      vi.mocked(authenticatedFetch).mockRejectedValue(new Error('boom'));
      expect(await deleteThread(SERVER_ID)).toBe(false);
    });

    it('does not ask the server to delete a chat that never reached it', async () => {
      // An unsent draft has a locally minted id. The server answers
      // 400 "Invalid thread_id format", which was counted as a
      // failure: "2 chats deleted, 17 failed on server" when the
      // seventeen had never been saved in the first place.
      expect(await deleteThread('chat-1760000000000')).toBe(true);
      expect(authenticatedFetch).not.toHaveBeenCalled();
    });
  });

  describe('getThreadState', () => {
    it('returns normalized messages from thread state', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            values: {
              messages: [
                { type: 'human', content: 'Hello' },
                { type: 'ai', content: 'Hi there' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const msgs = await getThreadState('t1');
      expect(msgs).toHaveLength(2);
      expect(msgs[0].content).toBe('Hello');
    });

    it('normalizes structured content arrays', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            values: {
              messages: [
                { type: 'ai', content: [{ type: 'text', text: 'Block content' }] },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const msgs = await getThreadState('t1');
      expect(msgs[0].content).toBe('Block content');
    });

    it('throws with .status on non-ok response (error surfaces to caller)', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 500 }));
      try {
        await getThreadState('t1');
        expect.unreachable('Expected getThreadState to throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toContain('Thread state request failed');
        expect(err.status).toBe(500);
      }
    });

    it('extracts error message from JSON body on non-ok response', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(JSON.stringify({ message: 'Model configuration is invalid' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      try {
        await getThreadState('t1');
        expect.unreachable('Expected getThreadState to throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Model configuration is invalid');
        expect(err.status).toBe(500);
      }
    });

    it('returns empty array on network error', async () => {
      vi.mocked(authenticatedFetch).mockRejectedValue(new Error('boom'));
      const msgs = await getThreadState('t1');
      expect(msgs).toEqual([]);
    });

    it('returns empty array when no messages in state', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(JSON.stringify({ values: {} }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const msgs = await getThreadState('t1');
      expect(msgs).toEqual([]);
    });

    it('combines tool call results with AI messages', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            values: {
              messages: [
                {
                  type: 'ai',
                  content: '',
                  tool_calls: [{ id: 'tc1', name: 'search', args: { q: 'test' } }],
                },
                { type: 'tool', content: 'result data', tool_call_id: 'tc1' },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const msgs = await getThreadState('t1');
      expect(msgs).toHaveLength(1);
      expect((msgs[0] as any).tool_calls[0].content).toBe('result data');
    });

    it('normalizes object content to JSON string', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            values: {
              messages: [{ type: 'ai', content: { key: 'value' } }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const msgs = await getThreadState('t1');
      expect(msgs[0].content).toBe('{"key":"value"}');
    });

    it('normalizes null content to string representation', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            values: {
              messages: [{ type: 'ai', content: null }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const msgs = await getThreadState('t1');
      expect(typeof msgs[0].content).toBe('string');
    });
  });

  describe('getThreadPendingInterrupt', () => {
    it('returns interrupt when tasks have interrupts', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            tasks: [
              { interrupts: [{ value: 'Please confirm', resumable: true }] },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await getThreadPendingInterrupt('t1');
      expect(result).toEqual({ value: 'Please confirm', resumable: true });
    });

    it('returns resumable: true when resumable is not explicitly false', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            tasks: [
              { interrupts: [{ value: 'confirm' }] },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await getThreadPendingInterrupt('t1');
      expect(result?.resumable).toBe(true);
    });

    it('returns null when no interrupts', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(JSON.stringify({ tasks: [{ interrupts: [] }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      expect(await getThreadPendingInterrupt('t1')).toBeNull();
    });

    it('returns null on failure', async () => {
      vi.mocked(authenticatedFetch).mockRejectedValue(new Error('boom'));
      expect(await getThreadPendingInterrupt('t1')).toBeNull();
    });

    it('returns null when tasks is not an array', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(JSON.stringify({}), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      expect(await getThreadPendingInterrupt('t1')).toBeNull();
    });

    it('throws with .status on non-ok HTTP response', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(JSON.stringify({ message: 'Agent not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      try {
        await getThreadPendingInterrupt('t1');
        expect.unreachable('Expected getThreadPendingInterrupt to throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Agent not found');
        expect(err.status).toBe(404);
      }
    });
  });

  describe('getThreadStateAndInterrupt', () => {
    it('returns both messages and interrupt', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            values: { messages: [{ type: 'ai', content: 'response' }] },
            tasks: [{ interrupts: [{ value: 'confirm', resumable: false }] }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await getThreadStateAndInterrupt('t1');
      expect(result.messages).toHaveLength(1);
      expect(result.interrupt).toEqual({ value: 'confirm', resumable: false });
    });

    it('returns empty messages and null interrupt on failure', async () => {
      vi.mocked(authenticatedFetch).mockRejectedValue(new Error('boom'));
      const result = await getThreadStateAndInterrupt('t1');
      expect(result).toEqual({ messages: [], interrupt: null });
    });

    it('returns messages with null interrupt when no tasks', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            values: { messages: [{ type: 'human', content: 'hi' }] },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const result = await getThreadStateAndInterrupt('t1');
      expect(result.messages).toHaveLength(1);
      expect(result.interrupt).toBeNull();
    });

    it('throws with .status on non-ok HTTP response', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(JSON.stringify({ message: 'Internal server error' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      try {
        await getThreadStateAndInterrupt('t1');
        expect.unreachable('Expected getThreadStateAndInterrupt to throw');
      } catch (err: any) {
        expect(err).toBeInstanceOf(Error);
        expect(err.message).toBe('Internal server error');
        expect(err.status).toBe(500);
      }
    });

    it('still returns fallback on network error (no .status)', async () => {
      vi.mocked(authenticatedFetch).mockRejectedValue(new Error('ECONNREFUSED'));
      const result = await getThreadStateAndInterrupt('t1');
      expect(result).toEqual({ messages: [], interrupt: null });
    });
  });
});

const uuid = (n: number) =>
  `${String(n).padStart(8, '0')}-1111-4222-8333-444444444444`;

describe('listAllThreadIds', () => {
  beforeEach(() => vi.mocked(authenticatedFetch).mockReset());

  it('returns every thread the agent reports, not just a loaded page', async () => {
    // The store holds what the sidebar fetched. Deleting "all" from
    // that list removed a couple of dozen of 354 and left the rest
    // to reappear on the next load.
    vi.mocked(authenticatedFetch).mockResolvedValue(
      new Response(
        JSON.stringify([{ thread_id: uuid(1) }, { thread_id: uuid(2) }]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    expect(await listAllThreadIds()).toEqual([uuid(1), uuid(2)]);
  });

  it('says it could not ask, rather than answering "none"', async () => {
    // `null`, not `[]`. Deleting nothing is the safe failure here, and
    // the caller needs to tell "no threads left" from "could not
    // reach the agent": the first means the sweep is done and the
    // stored deletion intent can go, the second means keep it.
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 503 }));
    expect(await listAllThreadIds()).toBeNull();
  });
});

describe('deleteThreads', () => {
  beforeEach(() => vi.mocked(authenticatedFetch).mockReset());

  it('deletes every id and counts them', async () => {
    vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 200 }));
    const ids = Array.from({ length: 25 }, (_, i) => uuid(i));

    expect(await deleteThreads(ids)).toEqual({ deleted: 25, failed: 0 });
    expect(authenticatedFetch).toHaveBeenCalledTimes(25);
  });

  it('never opens more connections than the limit allows', async () => {
    // Promise.all over 354 ids opened 354 simultaneous connections
    // against a service whose connection budget was sized down
    // deliberately.
    let inFlight = 0;
    let peak = 0;
    vi.mocked(authenticatedFetch).mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return new Response('', { status: 200 });
    });

    await deleteThreads(Array.from({ length: 40 }, (_, i) => uuid(i)), 8);

    expect(peak).toBeLessThanOrEqual(8);
  });

  it('separates what failed from what went', async () => {
    let n = 0;
    vi.mocked(authenticatedFetch).mockImplementation(async () => {
      n += 1;
      return new Response('', { status: n % 2 === 0 ? 500 : 200 });
    });

    const result = await deleteThreads(Array.from({ length: 4 }, (_, i) => uuid(i)), 1);
    expect(result).toEqual({ deleted: 2, failed: 2 });
  });

  it('does nothing with nothing', async () => {
    expect(await deleteThreads([])).toEqual({ deleted: 0, failed: 0 });
    expect(authenticatedFetch).not.toHaveBeenCalled();
  });
});
