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
  deleteThread,
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

  describe('deleteThread', () => {
    it('returns true on successful deletion', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 200 }));
      expect(await deleteThread('t1')).toBe(true);
    });

    it('returns true on 404 (already gone)', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 404 }));
      expect(await deleteThread('t1')).toBe(true);
    });

    it('returns false on other errors', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(new Response('', { status: 500 }));
      expect(await deleteThread('t1')).toBe(false);
    });

    it('returns false on network error', async () => {
      vi.mocked(authenticatedFetch).mockRejectedValue(new Error('boom'));
      expect(await deleteThread('t1')).toBe(false);
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

    it('keeps think tags inside a tool result', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            values: {
              messages: [
                {
                  type: 'ai',
                  content: '',
                  tool_calls: [{ id: 'tc1', name: 'search', args: {} }],
                },
                {
                  type: 'tool',
                  content: 'result <think>hidden</think> tail',
                  tool_call_id: 'tc1',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const msgs = await getThreadState('t1');
      expect((msgs[0] as any).tool_calls[0].content).toBe('result <think>hidden</think> tail');
    });

    it('keeps a saved thought after reload and leaves it out of the answer', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            values: {
              messages: [{
                type: 'ai',
                content: [
                  { type: 'thinking', thinking: 'secret chain of thought', signature: 'sig' },
                  { type: 'text', text: 'The answer' },
                ],
              }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const msgs = await getThreadState('t1');
      expect(msgs[0].content).toBe('The answer');
      expect((msgs[0] as { thinking?: string }).thinking).toBe('secret chain of thought');
    });

    it('does not strip a think tag out of a human message', async () => {
      vi.mocked(authenticatedFetch).mockResolvedValue(
        new Response(
          JSON.stringify({
            values: {
              messages: [{ type: 'human', content: 'hello <think>rest' }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const msgs = await getThreadState('t1');
      expect(msgs[0].content).toBe('hello <think>rest');
      expect((msgs[0] as { thinking?: string }).thinking).toBeUndefined();
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
