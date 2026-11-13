import React, { StrictMode } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message } from '@langchain/langgraph-sdk';
import { AIMessageRenderer } from './ChatMessagesView';

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

describe('AIMessageRenderer — tool display', () => {
  it('shows arguments and results when expanded without approval controls', async () => {
    renderStrict(
      <AIMessageRenderer message={makeMsg({
        tool_calls: [{ ...CREATE_PR_TOOL_CALL, content: 'PR created' }],
      })} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /expand tool call: github_create_pr/i }));
    expect(screen.getByText('PR created')).toBeInTheDocument();
    expect(screen.getByText(/"title": "My PR"/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /approve|reject|always allow/i })).not.toBeInTheDocument();
  });

  it('preserves manual expansion when a tool completes', async () => {
    const { rerender } = renderStrict(
      <AIMessageRenderer message={makeMsg({ tool_calls: [CREATE_PR_TOOL_CALL] })} />,
    );
    await userEvent.click(screen.getByRole('button', { name: /expand tool call: github_create_pr/i }));
    rerender(
      <StrictMode>
        <AIMessageRenderer message={makeMsg({
          tool_calls: [{ ...CREATE_PR_TOOL_CALL, content: 'PR created' }],
        })} />
      </StrictMode>,
    );
    expect(screen.getByRole('button', { name: /collapse tool call: github_create_pr/i })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('PR created')).toBeInTheDocument();
  });
});
