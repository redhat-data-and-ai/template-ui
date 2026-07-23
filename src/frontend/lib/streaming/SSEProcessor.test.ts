import { describe, it, expect, beforeEach } from 'vitest';
import { SSEProcessor } from './SSEProcessor';

function makeData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

describe('SSEProcessor', () => {
  let proc: SSEProcessor;

  beforeEach(() => {
    proc = new SSEProcessor();
  });

  // ── Token chunk ──────────────────────────────────────────────────────────
  it('parses a token chunk', () => {
    const events = proc.feed(makeData({ type: 'token', content: 'Hello', chunk_id: 0 }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'chunk', data: { type: 'token', content: 'Hello', chunk_id: 0 } });
  });

  // ── Interrupt chunk (HITLInterruptValue object) ──────────────────────────
  it('parses an interrupt chunk with object value', () => {
    const value = {
      action_requests: [{ name: 'create_pr', args: {} }],
      review_configs: [{ action_name: 'create_pr', allowed_decisions: ['approve', 'reject'] }],
    };
    const events = proc.feed(
      makeData({ type: 'interrupt', content: { value, resumable: true }, chunk_id: 1 }),
    );
    expect(events).toHaveLength(1);
    const ev = events[0];
    // Explicit kind assertion first — guards below won't silently pass on wrong shape
    expect(ev.kind).toBe('chunk');
    if (ev.kind === 'chunk') {
      expect(ev.data.type).toBe('interrupt');
      if (ev.data.type === 'interrupt') {
        expect(ev.data.content.resumable).toBe(true);
        expect(ev.data.content.value).toMatchObject(value);
      }
    }
  });

  // ── Interrupt chunk (resumable: false) ───────────────────────────────────
  it('preserves resumable: false on an interrupt chunk', () => {
    const events = proc.feed(
      makeData({ type: 'interrupt', content: { value: 'Confirm?', resumable: false }, chunk_id: 3 }),
    );
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.kind).toBe('chunk');
    if (ev.kind === 'chunk') {
      expect(ev.data.type).toBe('interrupt');
      if (ev.data.type === 'interrupt') {
        expect(ev.data.content.resumable).toBe(false);
      }
    }
  });

  // ── Interrupt chunk (plain string value preserved) ───────────────────────
  it('preserves a plain-text (non-JSON) interrupt value as a string', () => {
    const events = proc.feed(
      makeData({
        type: 'interrupt',
        content: { value: 'Do you approve this action?', resumable: true },
        chunk_id: 99,
      }),
    );
    expect(events).toHaveLength(1);
    const ev = events[0];
    // Explicit kind assertion first — guard below won't silently pass on wrong shape
    expect(ev.kind).toBe('chunk');
    if (ev.kind === 'chunk') {
      expect(ev.data.type).toBe('interrupt');
      if (ev.data.type === 'interrupt') {
        expect(ev.data.content.value).toBe('Do you approve this action?');
      }
    }
  });

  // ── Interrupt chunk (JSON string value unwrapped) ─────────────────────────
  it('unwraps a JSON string interrupt value into an object', () => {
    const rawValue = { action_requests: [], review_configs: [] };
    const events = proc.feed(
      makeData({
        type: 'interrupt',
        content: { value: JSON.stringify(rawValue), resumable: true },
        chunk_id: 2,
      }),
    );
    expect(events).toHaveLength(1);
    const ev = events[0];
    // Explicit kind assertion first — guard below won't silently pass on wrong shape
    expect(ev.kind).toBe('chunk');
    if (ev.kind === 'chunk') {
      expect(ev.data.type).toBe('interrupt');
      if (ev.data.type === 'interrupt') {
        expect(ev.data.content.value).toMatchObject(rawValue);
      }
    }
  });

  // ── Interrupt chunk (numeric value → fallback empty object) ───────────────
  it('falls back to {} when the interrupt value is neither an object nor a string', () => {
    const events = proc.feed(
      makeData({ type: 'interrupt', content: { value: 42, resumable: true }, chunk_id: 5 }),
    );
    expect(events).toHaveLength(1);
    const ev = events[0];
    expect(ev.kind).toBe('chunk');
    if (ev.kind === 'chunk') {
      expect(ev.data.type).toBe('interrupt');
      if (ev.data.type === 'interrupt') {
        expect(ev.data.content.value).toEqual({});
      }
    }
  });

  // ── Message chunk ─────────────────────────────────────────────────────────
  it('parses a message chunk', () => {
    const msg = { type: 'ai', content: 'Done', tool_calls: [], id: 'msg-1' };
    const events = proc.feed(makeData({ type: 'message', content: msg, chunk_id: 3 }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'chunk', data: { type: 'message' } });
  });

  // ── mcp_status via event: line ────────────────────────────────────────────
  it('parses an mcp_status event from the event: field', () => {
    const raw = `event: mcp_status\ndata: ${JSON.stringify({ tool: 'github', status: 'running' })}\n\n`;
    const events = proc.feed(raw);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'mcp_status', data: { tool: 'github', status: 'running' } });
  });

  // ── mcp_status via type field in data ─────────────────────────────────────
  it('parses an mcp_status event from the type field in data', () => {
    const events = proc.feed(makeData({ type: 'mcp_status', tool: 'github', status: 'done' }));
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'mcp_status', data: { tool: 'github', status: 'done' } });
  });

  // ── Metadata chunk ───────────────────────────────────────────────────────
  it('parses a metadata chunk', () => {
    const events = proc.feed(
      makeData({ type: 'metadata', content: { run_id: 'r1', trace_id: 't1', thread_id: 'th1' } }),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: 'metadata',
      data: { run_id: 'r1', trace_id: 't1', thread_id: 'th1' },
    });
  });

  // ── Metadata missing fields → not parsed as metadata ─────────────────────
  it('does not parse metadata when required fields are missing', () => {
    const events = proc.feed(
      makeData({ type: 'metadata', content: { run_id: 'r1' } }),
    );
    // No run_id+trace_id+thread_id → falls through to error (invalid message shape)
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('error');
  });

  // ── [DONE] sentinel ───────────────────────────────────────────────────────
  it('emits a done event for [DONE]', () => {
    const events = proc.feed('data: [DONE]\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({ kind: 'done' });
  });

  // ── Invalid JSON → error event ────────────────────────────────────────────
  it('emits an error event for invalid JSON', () => {
    const events = proc.feed('data: {this is not json}\n\n');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'error', message: expect.stringContaining('Malformed SSE chunk') });
  });

  // ── Unknown shape → error event ───────────────────────────────────────────
  it('emits an error event for a valid JSON object with unknown shape', () => {
    const events = proc.feed(makeData({ type: 'unknown_type', foo: 'bar' }));
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('error');
  });

  // ── Multi-chunk buffer (split across two feed() calls) ──────────────────
  it('buffers incomplete SSE data across feed() calls', () => {
    const fullEvent = `data: ${JSON.stringify({ type: 'token', content: 'hi', chunk_id: 0 })}`;
    // Feed first half without the trailing \n\n
    const events1 = proc.feed(fullEvent);
    expect(events1).toHaveLength(0);
    // Feed the closing delimiter
    const events2 = proc.feed('\n\n');
    expect(events2).toHaveLength(1);
    expect(events2[0]).toMatchObject({ kind: 'chunk', data: { type: 'token', content: 'hi' } });
  });

  // ── Multiple events in one feed() call ───────────────────────────────────
  it('returns multiple events when multiple complete SSE blocks arrive', () => {
    const block1 = makeData({ type: 'token', content: 'a', chunk_id: 0 });
    const block2 = makeData({ type: 'token', content: 'b', chunk_id: 1 });
    const events = proc.feed(block1 + block2);
    expect(events).toHaveLength(2);
  });

  // ── reset() clears mid-buffer state ──────────────────────────────────────
  it('reset() discards buffered incomplete data', () => {
    const partial = `data: ${JSON.stringify({ type: 'token', content: 'hi', chunk_id: 0 })}`;
    proc.feed(partial); // no \n\n — stays in buffer
    proc.reset();
    const events = proc.feed('\n\n'); // delimiter without prior data
    expect(events).toHaveLength(0);
  });

  // ── Comment lines ignored ─────────────────────────────────────────────────
  it('ignores SSE comment lines (: prefix)', () => {
    const raw = `: keep-alive\ndata: ${JSON.stringify({ type: 'token', content: 'x', chunk_id: 0 })}\n\n`;
    const events = proc.feed(raw);
    expect(events).toHaveLength(1);
    expect(events[0].kind).toBe('chunk');
  });
});
