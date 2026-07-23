import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Message } from '@langchain/langgraph-sdk';
import { AIMessageRenderer } from './ChatMessagesView';
import type { InterruptInfo } from '../types/deep-agent';

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

  it('hides approval buttons after one of them is clicked (approvalSubmitted)', async () => {
    const msg = makeMsg({ tool_calls: [CREATE_PR_TOOL_CALL] });

    render(
      <AIMessageRenderer
        message={msg}
        pendingInterrupt={hitlInterrupt}
        onInterruptResume={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole('button', { name: /approve tool call: github_create_pr/i }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /approve tool call: github_create_pr/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reject tool call: github_create_pr/i })).not.toBeInTheDocument();
    });
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
