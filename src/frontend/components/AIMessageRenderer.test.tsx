import React, { StrictMode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message } from '@langchain/langgraph-sdk';
import { AIMessageRenderer } from './ChatMessagesView';
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
