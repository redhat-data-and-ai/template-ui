/**
 * The Connect box renders from `payload`, and the agent sends a string.
 *
 * `ChatPage` stored the interrupt exactly as the thread-state reader
 * returned it, so opening a paused conversation left `payload`
 * undefined and showed no Connect box. The run sat waiting for an
 * authorization nobody was asked for.
 */
import { describe, expect, it } from 'vitest';

import { enrichInterrupt } from '../enrich-interrupt';

const MCP_JSON = JSON.stringify({
  type: 'mcp_auth_required',
  mcp_name: 'atlan',
  reason: 'not_connected',
  connect_url: 'https://agent.example/mcp/atlan/connect',
});

describe('enrichInterrupt', () => {
  it('parses the JSON string the agent sends', () => {
    const out = enrichInterrupt({ value: MCP_JSON, resumable: true });
    expect(out.payload?.mcp_name).toBe('atlan');
    expect(out.payload?.reason).toBe('not_connected');
  });

  it('accepts an already-parsed object', () => {
    const out = enrichInterrupt({
      value: { type: 'mcp_auth_required', mcp_name: 'dataverse' } as never,
      resumable: true,
    });
    expect(out.payload?.mcp_name).toBe('dataverse');
  });

  it('leaves a plain-text interrupt alone', () => {
    const out = enrichInterrupt({ value: 'approve this?', resumable: true });
    expect(out.payload).toBeUndefined();
    expect(out.value).toBe('approve this?');
  });

  it('does not choke on JSON that is not an auth pause', () => {
    const out = enrichInterrupt({
      value: JSON.stringify({ action_requests: [{ name: 'write_file' }] }),
      resumable: true,
    });
    expect(out.payload).toBeUndefined();
  });

  it('keeps resumable', () => {
    expect(enrichInterrupt({ value: MCP_JSON, resumable: false }).resumable).toBe(false);
  });
});
