import { describe, it, expect } from 'vitest';

import { __testing } from './proxy.router';

const { buildToolMessageContent, translateMessageEvent } = __testing;

describe('buildToolMessageContent', () => {
  it('forwards status="error" so denied calls do not render as success', () => {
    // Policy denials (OPA, capability manifest, guardrails, MCP auth) return a
    // ToolMessage with status="error". The frontend styles the call red only
    // when it sees that field, so the proxy has to pass it through.
    const content = buildToolMessageContent({
      type: 'tool',
      content: 'Tool is disabled by configuration and was not executed.',
      tool_call_id: 'call_1',
      name: 'delete',
      status: 'error',
    });

    expect(content.status).toBe('error');
  });

  it('omits status when the tool result carries none', () => {
    const content = buildToolMessageContent({
      type: 'tool',
      content: 'ok',
      tool_call_id: 'call_2',
      name: 'read_file',
    });

    expect(content).not.toHaveProperty('status');
  });

  it('ignores a non-string status rather than forwarding junk', () => {
    const content = buildToolMessageContent({
      type: 'tool',
      content: 'ok',
      tool_call_id: 'call_3',
      name: 'read_file',
      status: { unexpected: true },
    });

    expect(content).not.toHaveProperty('status');
  });
});

describe('translateMessageEvent', () => {
  it('preserves the error status end-to-end through an updates event', () => {
    const [chunks] = translateMessageEvent(
      'updates',
      {
        tools: {
          messages: [
            {
              type: 'tool',
              content: 'denied by policy',
              tool_call_id: 'call_9',
              name: 'write_file',
              status: 'error',
            },
          ],
        },
      },
      0,
      '',
      new Set<string>(),
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toMatchObject({
      type: 'tool',
      name: 'write_file',
      status: 'error',
    });
  });
});
