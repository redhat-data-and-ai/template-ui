import { describe, expect, it } from 'vitest';
import { summariseSubagentEvent } from './subagent-progress';

const NS = 'tools:4732e943-1815-7ed7-7e6a-458b431510e7';

describe('summariseSubagentEvent', () => {
  it('reads the instruction from the subagent first message', () => {
    // The namespace id does not match the parent tool-call id, so
    // the instruction is the only way to tell two concurrent
    // delegations apart.
    const out = summariseSubagentEvent(NS, {
      messages: [{ type: 'human', content: 'Write two sentences about this agent.' }],
    });
    expect(out?.instruction).toBe('Write two sentences about this agent.');
  });

  it('reads the latest text the subagent produced', () => {
    const out = summariseSubagentEvent(NS, {
      messages: [
        { type: 'human', content: 'Summarise.' },
        { type: 'ai', content: [{ type: 'text', text: 'Workpilot assists Red Hat staff.' }] },
      ],
    });
    expect(out?.latest).toBe('Workpilot assists Red Hat staff.');
  });

  it('names the node from an updates event', () => {
    const out = summariseSubagentEvent(NS, { model: { messages: [] } });
    expect(out?.node).toBe('model');
  });

  it('pulls text out of a nested updates payload', () => {
    const out = summariseSubagentEvent(NS, {
      model: { messages: [{ content: [{ type: 'text', text: 'partial answer' }] }] },
    });
    expect(out?.latest).toBe('partial answer');
  });

  it('returns null when the event moved nothing forward', () => {
    // A bare namespace on screen tells the reader nothing.
    expect(summariseSubagentEvent(NS, {})).toBeNull();
  });

  it('trims a long draft to a status line', () => {
    const out = summariseSubagentEvent(NS, {
      messages: [{ type: 'ai', content: 'x'.repeat(500) }],
    });
    expect(out?.latest?.length).toBeLessThanOrEqual(160);
  });

  it('always carries the namespace so progress can be grouped', () => {
    const out = summariseSubagentEvent(NS, { model: {} });
    expect(out?.ns).toBe(NS);
  });
});
