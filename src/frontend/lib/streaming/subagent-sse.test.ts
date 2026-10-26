import { describe, expect, it } from 'vitest';
import { SSEProcessor } from './SSEProcessor';

/**
 * The agent name has to survive parsing. It is the only thing that
 * tells the box which of the two progress entries is its own.
 */
function parse(event: string, data: Record<string, unknown>) {
  const p = new SSEProcessor();
  return p.feed(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

describe('subagent_progress parsing', () => {
  it('keeps the agent name', () => {
    const [ev] = parse('subagent_progress', {
      ns: 'agent:summariser',
      agent: 'summariser',
      latest: 'Workpilot is a work assistant',
    });
    expect(ev).toMatchObject({
      kind: 'subagent_progress',
      data: { agent: 'summariser', latest: 'Workpilot is a work assistant' },
    });
  });

  it('keeps the node when that is all there is', () => {
    const [ev] = parse('subagent_progress', { ns: 'tools:abc', node: 'model' });
    expect(ev).toMatchObject({ kind: 'subagent_progress', data: { node: 'model' } });
  });

  it('does not emit progress for a payload with no namespace', () => {
    // Without a namespace there is nothing to group the entry under,
    // so it cannot be attributed to a delegation. It falls through
    // to the generic handling rather than becoming a stray row.
    const events = parse('subagent_progress', { latest: 'orphan' });
    expect(events.every((e) => e.kind !== 'subagent_progress')).toBe(true);
  });

  it('does not claim ordinary events', () => {
    const events = parse('mcp_status', { tool: 'x', status: 'ok' });
    expect(events.every((e) => e.kind !== 'subagent_progress')).toBe(true);
  });
});
