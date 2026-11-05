import React, { StrictMode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message } from '@langchain/langgraph-sdk';
import { AIMessageRenderer, buildTurnSegments } from './ChatMessagesView';
import type { InterruptInfo } from '../types/deep-agent';

vi.mock('./McpAppHost', () => ({
  McpAppHostFromToolCall: () => <div data-testid="mcp-app-host" />,
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Cast a plain object to the LangGraph Message type — only the fields used by
 *  AIMessageRenderer are needed at runtime. */
function makeMsg(overrides: Record<string, unknown>): Message {
  return { type: 'ai', content: '', id: 'msg-1', tool_calls: [], ...overrides } as unknown as Message;
}

const CREATE_PR_TOOL_CALL = {
  id: 'tc-1',
  name: 'github_create_pr',
  args: { title: 'My PR', base: 'main' },
};

const hitlInterrupt: InterruptInfo = {
  value: {
    action_requests: [{ name: 'github_create_pr', args: { title: 'My PR' } }],
    review_configs: [{ action_name: 'github_create_pr', allowed_decisions: ['approve', 'reject'] }],
  },
  resumable: true,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AIMessageRenderer — answered question', () => {
  it('shows the question and the answer instead of a tool box', () => {
    const msg = makeMsg({
      tool_calls: [{
        id: 'tc-ask',
        name: 'clarify',
        args: { question: 'Units?', options: ['kg', 'lbs'] },
        content: 'kg',
      }],
    });

    render(<AIMessageRenderer message={msg} />);

    expect(screen.getByRole('group', { name: 'Answered question' })).toBeInTheDocument();
    expect(screen.getByText('Units?')).toBeInTheDocument();
    expect(screen.getByText('kg')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tool call: clarify/i })).not.toBeInTheDocument();
  });

  it('leaves an unanswered question out of the transcript', () => {
    const msg = makeMsg({
      tool_calls: [{ id: 'tc-ask', name: 'clarify', args: { question: 'Units?' } }],
    });

    render(<AIMessageRenderer message={msg} />);

    expect(screen.queryByText('Units?')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /tool call: clarify/i })).not.toBeInTheDocument();
  });
});

describe('AIMessageRenderer — HITL approval (production path for HITLInterruptValue)', () => {
  it('renders Approve and Reject buttons for a pending tool-call interrupt', () => {
    const msg = makeMsg({ tool_calls: [CREATE_PR_TOOL_CALL] });

    render(
      <AIMessageRenderer
        message={msg}
        pendingInterrupt={hitlInterrupt}
        onInterruptResume={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /approve tool call: github_create_pr/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject tool call: github_create_pr/i })).toBeInTheDocument();
  });

  it('calls onInterruptResume with approve decisions when Approve is clicked', async () => {
    const onInterruptResume = vi.fn();
    const msg = makeMsg({ tool_calls: [CREATE_PR_TOOL_CALL] });

    render(
      <AIMessageRenderer
        message={msg}
        pendingInterrupt={hitlInterrupt}
        onInterruptResume={onInterruptResume}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /approve tool call: github_create_pr/i }));
    expect(onInterruptResume).toHaveBeenCalledOnce();
    const [decisions] = onInterruptResume.mock.calls[0];
    expect(decisions).toEqual(expect.arrayContaining([{ type: 'approve' }]));
    expect(decisions.every((d: { type: string }) => d.type === 'approve')).toBe(true);
  });

  it('calls onInterruptResume with reject decisions when Reject is clicked', async () => {
    const onInterruptResume = vi.fn();
    const msg = makeMsg({ tool_calls: [CREATE_PR_TOOL_CALL] });

    render(
      <AIMessageRenderer
        message={msg}
        pendingInterrupt={hitlInterrupt}
        onInterruptResume={onInterruptResume}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /reject tool call: github_create_pr/i }));
    expect(onInterruptResume).toHaveBeenCalledOnce();
    const [decisions] = onInterruptResume.mock.calls[0];
    expect(decisions.every((d: { type: string }) => d.type === 'reject')).toBe(true);
  });

  it('calls onAlwaysAllow and approves when Always allow is clicked', async () => {
    const onInterruptResume = vi.fn();
    const onAlwaysAllow = vi.fn();
    const msg = makeMsg({ tool_calls: [CREATE_PR_TOOL_CALL] });

    render(
      <AIMessageRenderer
        message={msg}
        pendingInterrupt={hitlInterrupt}
        onInterruptResume={onInterruptResume}
        onAlwaysAllow={onAlwaysAllow}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /always allow tool: github_create_pr/i }));
    expect(onAlwaysAllow).toHaveBeenCalledWith(['github_create_pr']);
    expect(onInterruptResume).toHaveBeenCalledOnce();
    const [decisions] = onInterruptResume.mock.calls[0];
    expect(decisions.every((d: { type: string }) => d.type === 'approve')).toBe(true);
  });

  it('hides approval buttons when pendingInterrupt is cleared (post-approval)', () => {
    const msg = makeMsg({ tool_calls: [CREATE_PR_TOOL_CALL] });

    const { rerender } = render(
      <AIMessageRenderer
        message={msg}
        pendingInterrupt={hitlInterrupt}
        onInterruptResume={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /approve tool call: github_create_pr/i })).toBeInTheDocument();

    rerender(
      <AIMessageRenderer
        message={msg}
        pendingInterrupt={null}
        onInterruptResume={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /approve tool call: github_create_pr/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject tool call: github_create_pr/i })).not.toBeInTheDocument();
  });

  it('does NOT render approval buttons when pendingInterrupt is null', () => {
    const msg = makeMsg({ tool_calls: [CREATE_PR_TOOL_CALL] });

    render(
      <AIMessageRenderer message={msg} pendingInterrupt={null} onInterruptResume={vi.fn()} />,
    );

    expect(screen.queryByRole('button', { name: /approve tool call/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reject tool call/i })).not.toBeInTheDocument();
  });

  it('does NOT render approval buttons when onInterruptResume is not provided', () => {
    const msg = makeMsg({ tool_calls: [CREATE_PR_TOOL_CALL] });

    render(
      <AIMessageRenderer message={msg} pendingInterrupt={hitlInterrupt} />,
    );

    expect(screen.queryByRole('button', { name: /approve tool call/i })).not.toBeInTheDocument();
  });
});

const SUBAGENT_TASK = {
  id: 'tc-task',
  name: 'task',
  args: { subagent_type: 'researcher', description: 'Look up the requested data' },
};

const innerToolInterrupt: InterruptInfo = {
  value: {
    action_requests: [{
      name: 'lookup_records',
      args: { query: 'example' },
    }],
    review_configs: [{
      action_name: 'lookup_records',
      allowed_decisions: ['approve', 'reject'],
    }],
  },
  resumable: true,
};

describe('buildTurnSegments', () => {
  it('keeps each sentence and puts later tools and thoughts after it', () => {
    const segments = buildTurnSegments([
      makeMsg({
        id: 'm1',
        thinking: 'plan the lookup',
        content: "I'll look up orders",
        tool_calls: [{ id: 'tc', name: 'search', args: { query: 'orders' } }],
      }),
      makeMsg({
        id: 'm2',
        thinking: 'read the rows',
        content: 'Here are the orders',
        tool_calls: [],
      }),
    ]);

    expect(segments.map((segment) => segment.type)).toEqual(['thought', 'stream', 'thought', 'stream']);
    expect(segments[0]).toMatchObject({ items: [{ kind: 'thinking', text: 'plan the lookup' }] });
    expect(segments[1]).toMatchObject({ text: "I'll look up orders" });
    expect(segments[2]).toMatchObject({
      items: [
        { kind: 'tools', tools: [expect.objectContaining({ name: 'search' })] },
        { kind: 'thinking', text: 'read the rows' },
      ],
    });
    expect(segments[3]).toMatchObject({ text: 'Here are the orders' });
  });

  it('keeps one row when the same tool id arrives twice', () => {
    const segments = buildTurnSegments([
      makeMsg({
        id: 'm1',
        content: '',
        tool_calls: [{ id: 'tc-1', name: 'search', args: {} }],
      }),
      makeMsg({
        id: 'm2',
        content: '',
        tool_calls: [{ id: 'tc-1', name: 'search', args: { query: 'later' } }],
      }),
    ]);
    const tools = segments.flatMap((segment) => (
      segment.type === 'thought'
        ? segment.items.flatMap((item) => (item.kind === 'tools' ? item.tools : []))
        : []
    ));
    expect(tools).toHaveLength(1);
    expect(tools[0].id).toBe('tc-1');
    expect(tools[0].args).toEqual({ query: 'later' });
  });

  it('shows the sentence, then the tool, then the later thought', () => {
    render(
      <AIMessageRenderer
        message={makeMsg({ id: 'm2' })}
        turnMessages={[
          makeMsg({
            id: 'm1',
            thinking: 'plan the lookup',
            content: "I'll look up orders",
            tool_calls: [{ id: 'tc', name: 'search', args: {} }],
          }),
          makeMsg({
            id: 'm2',
            thinking: 'read the rows',
            content: '',
          }),
        ]}
      />,
    );

    const text = document.body.textContent ?? '';
    expect(text.indexOf("I'll look up orders")).toBeLessThan(text.indexOf('search'));
    expect(text.indexOf('search')).toBeLessThan(text.indexOf('read the rows'));
    expect(text).not.toContain('plan the lookup');
  });
});

describe('AIMessageRenderer — narration before a task card', () => {
  it('shows the spoken sentence above the task card', () => {
    render(
      <AIMessageRenderer
        message={makeMsg({
          content: 'This looks like a data query.',
          tool_calls: [SUBAGENT_TASK],
        })}
      />,
    );

    expect(screen.getByText('This looks like a data query.')).toBeInTheDocument();
    expect(screen.getByText('researcher')).toBeInTheDocument();
  });

  it('shows a saved thought collapsed above the task card', () => {
    render(
      <AIMessageRenderer
        message={makeMsg({
          content: [
            { type: 'thinking', thinking: 'secret chain of thought' },
            { type: 'text', text: 'This looks like a data query.' },
          ],
          tool_calls: [SUBAGENT_TASK],
        })}
      />,
    );

    expect(screen.getByText('This looks like a data query.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thought process' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('researcher')).toBeInTheDocument();
  });

  it('shows the thought open while it is still streaming', () => {
    render(
      <AIMessageRenderer
        thinkingLive
        message={makeMsg({
          content: '',
          thinking: 'secret chain of thought',
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Thinking...' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('secret chain of thought')).toBeInTheDocument();
  });

  it('does not show a redacted tag that is the whole message', () => {
    render(
      <AIMessageRenderer
        message={makeMsg({
          content: '<redacted_thinking>secret',
        })}
      />,
    );

    expect(screen.queryByText('secret')).not.toBeInTheDocument();
    expect(screen.queryByText(/redacted_thinking/)).not.toBeInTheDocument();
  });
});

describe('AIMessageRenderer — nested subagent HITL', () => {
  it('shows approval buttons when a running subagent pauses on an inner tool', () => {
    render(
      <AIMessageRenderer
        message={makeMsg({ tool_calls: [SUBAGENT_TASK] })}
        pendingInterrupt={innerToolInterrupt}
        onInterruptResume={vi.fn()}
        onAlwaysAllow={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /approve tool: lookup_records/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject tool: lookup_records/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /always allow tool: lookup_records/i })).toBeInTheDocument();
    expect(screen.getByText('lookup_records')).toBeInTheDocument();
  });

  it('resumes with approve when the inner-tool Approve is clicked', async () => {
    const onInterruptResume = vi.fn();
    render(
      <AIMessageRenderer
        message={makeMsg({ tool_calls: [SUBAGENT_TASK] })}
        pendingInterrupt={innerToolInterrupt}
        onInterruptResume={onInterruptResume}
        onAlwaysAllow={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /approve tool: lookup_records/i }));
    expect(onInterruptResume).toHaveBeenCalledWith([{ type: 'approve' }]);
  });

  it('Always allow records the inner tool name, not the subagent', async () => {
    const onInterruptResume = vi.fn();
    const onAlwaysAllow = vi.fn();
    render(
      <AIMessageRenderer
        message={makeMsg({ tool_calls: [SUBAGENT_TASK] })}
        pendingInterrupt={innerToolInterrupt}
        onInterruptResume={onInterruptResume}
        onAlwaysAllow={onAlwaysAllow}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /always allow tool: lookup_records/i }));
    expect(onAlwaysAllow).toHaveBeenCalledWith(['lookup_records']);
    expect(onInterruptResume).toHaveBeenCalledWith([{ type: 'approve' }]);
  });

  it('does not show inner-tool approval on a completed subagent', () => {
    render(
      <AIMessageRenderer
        message={makeMsg({
          tool_calls: [{ ...SUBAGENT_TASK, content: 'done' }],
        })}
        pendingInterrupt={innerToolInterrupt}
        onInterruptResume={vi.fn()}
        onAlwaysAllow={vi.fn()}
      />,
    );

    expect(screen.queryByRole('button', { name: /approve tool: lookup_records/i })).not.toBeInTheDocument();
  });
});

const MCP_APP = { server: 'charts', resourceUri: 'ui://charts/app.html' };

const chartCall = {
  id: 'tc-chart',
  name: 'show_chart',
  args: { topic: 'sales' },
};

function renderStrict(ui: React.ReactElement) {
  return render(<StrictMode>{ui}</StrictMode>);
}

describe('AIMessageRenderer — MCP App collapse behavior', () => {
  it('stays collapsed when mcpApp arrives with content (finished tool)', async () => {
    const { rerender } = renderStrict(
      <AIMessageRenderer message={makeMsg({ tool_calls: [chartCall] })} />,
    );

    expect(screen.getByRole('button', { name: /expand tool call: show_chart/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    rerender(
      <StrictMode>
        <AIMessageRenderer
          message={makeMsg({
            tool_calls: [{ ...chartCall, mcpApp: MCP_APP, content: 'ok' }],
          })}
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand tool call: show_chart/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });
  });

  it('does not expand a regular tool without mcpApp', async () => {
    const { rerender } = renderStrict(
      <AIMessageRenderer message={makeMsg({ tool_calls: [chartCall] })} />,
    );

    rerender(
      <StrictMode>
        <AIMessageRenderer
          message={makeMsg({ tool_calls: [{ ...chartCall, content: 'ok' }] })}
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand tool call: show_chart/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });
  });

  it('stays collapsed on later stream ticks after tool finishes', async () => {
    const withApp = makeMsg({
      tool_calls: [{ ...chartCall, mcpApp: MCP_APP, content: 'ok' }],
    });
    const { rerender } = renderStrict(<AIMessageRenderer message={withApp} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand tool call: show_chart/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });

    rerender(
      <StrictMode>
        <AIMessageRenderer
          message={makeMsg({
            tool_calls: [{ ...chartCall, mcpApp: MCP_APP, content: 'ok (updated)' }],
          })}
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand tool call: show_chart/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });
  });
});

describe('AIMessageRenderer — auto-collapse on tool completion', () => {
  it('auto-collapses a tool card once content is set', async () => {
    const pendingMsg = makeMsg({ tool_calls: [CREATE_PR_TOOL_CALL] });

    const { rerender } = renderStrict(
      <AIMessageRenderer
        message={pendingMsg}
        pendingInterrupt={hitlInterrupt}
        onInterruptResume={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /collapse tool call: github_create_pr/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    const finishedMsg = makeMsg({
      tool_calls: [{ ...CREATE_PR_TOOL_CALL, content: 'PR created' }],
    });
    rerender(
      <StrictMode>
        <AIMessageRenderer message={finishedMsg} pendingInterrupt={null} onInterruptResume={vi.fn()} />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand tool call: github_create_pr/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });
  });

  it('preserves manual expand after tool completes (user override)', async () => {
    const finishedMsg = makeMsg({
      tool_calls: [{ ...CREATE_PR_TOOL_CALL, content: 'PR created' }],
    });

    renderStrict(
      <AIMessageRenderer message={finishedMsg} pendingInterrupt={null} onInterruptResume={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /expand tool call: github_create_pr/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    await userEvent.click(screen.getByRole('button', { name: /expand tool call: github_create_pr/i }));

    expect(screen.getByRole('button', { name: /collapse tool call: github_create_pr/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('manual collapse during approval suppresses re-expand', async () => {
    const pendingMsg = makeMsg({ tool_calls: [CREATE_PR_TOOL_CALL] });

    const { rerender } = renderStrict(
      <AIMessageRenderer
        message={pendingMsg}
        pendingInterrupt={hitlInterrupt}
        onInterruptResume={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /collapse tool call: github_create_pr/i })).toHaveAttribute(
        'aria-expanded',
        'true',
      );
    });

    await userEvent.click(screen.getByRole('button', { name: /collapse tool call: github_create_pr/i }));
    expect(screen.getByRole('button', { name: /expand tool call: github_create_pr/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    rerender(
      <StrictMode>
        <AIMessageRenderer
          message={pendingMsg}
          pendingInterrupt={hitlInterrupt}
          onInterruptResume={vi.fn()}
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand tool call: github_create_pr/i })).toHaveAttribute(
        'aria-expanded',
        'false',
      );
    });
  });
});

describe('AIMessageRenderer — answer charts', () => {
  it('draws a chart fence in the answer and leaves the fence marker out', () => {
    render(
      <AIMessageRenderer
        message={makeMsg({
          content: 'Here is the trend.\n\n:::chart\n{"type":"bar","title":"Quarterly sales","data":[{"x":"Q1","y":3}]}\n:::\n',
        })}
      />,
    );

    expect(screen.getByText('Here is the trend.')).toBeInTheDocument();
    expect(screen.getByText('Quarterly sales')).toBeInTheDocument();
    expect(screen.queryByText(/:::chart/)).not.toBeInTheDocument();
  });

  it('leaves a chart fence inside a thought as text', () => {
    render(
      <AIMessageRenderer
        thinkingLive
        message={makeMsg({
          content: '',
          thinking: ':::chart\n{"type":"bar","title":"Hidden chart","data":[{"x":"Q1","y":1}]}\n:::',
        })}
      />,
    );

    expect(screen.getByText(/:::chart/)).toBeInTheDocument();
    expect(screen.queryByText('Hidden chart')).not.toBeInTheDocument();
  });
});
