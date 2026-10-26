import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AIMessageRenderer } from './ChatMessagesView';
import type { DelegationProgress } from '../lib/subagent-steps';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o?.node ? `${k}:${o.node}` : o?.tool ? `${k}:${o.tool}` : k,
  }),
}));

/**
 * The whole frontend chain below the hook: a delegating `task` call
 * plus the progress map, through AIMessageRenderer to the box.
 *
 * Every piece of this was unit-tested in isolation while the box
 * still showed the wrong thing, because the breaks were between the
 * pieces — the agent name dropped in SSEProcessor, the block inside
 * the collapse, tool results treated as prose. This spans the joins.
 */
const message = (subagent: string, id = 'm1') => ({
  id,
  type: 'ai',
  content: '',
  tool_calls: [
    { name: 'task', id: `call_${id}`, args: { subagent_type: subagent, description: 'Do it' } },
  ],
});

const INVESTIGATOR: DelegationProgress = {
  ns: 'agent:investigator',
  agent: 'investigator',
  startedAt: Date.now() - 42_000,
  steps: [
    { tool: 'gitlab_list_merge_requests', startedAt: 1000, endedAt: 2200 },
    { tool: 'gitlab_get_project', startedAt: 2200 },
  ],
};

describe('AIMessageRenderer -> SubAgentIndicator', () => {
  it('shows the timeline for the matching subagent', () => {
    render(
      <AIMessageRenderer
        message={message('investigator') as never}
        subagentProgress={{ 'agent:investigator': INVESTIGATOR }}
      />,
    );
    // Collapsed shows the live step only; it still proves the box
    // picked up this subagent's progress and not another's.
    expect(screen.getByText('GitLab · get project')).toBeInTheDocument();
  });

  it('keeps two concurrent delegations apart', () => {
    // Matched by agent name: `lc_agent_name` on the stream is the
    // same value as `args.subagent_type` on the task call.
    const workspace: DelegationProgress = {
      ns: 'agent:workspace',
      agent: 'workspace',
      startedAt: Date.now(),
      steps: [{ tool: 'gworkspace_search_gmail_messages', startedAt: 1000 }],
    };
    render(
      <AIMessageRenderer
        message={message('workspace', 'm2') as never}
        subagentProgress={{ 'agent:investigator': INVESTIGATOR, 'agent:workspace': workspace }}
      />,
    );
    expect(screen.getByText('Google Workspace · search gmail messages')).toBeInTheDocument();
    expect(screen.queryByText('GitLab · list merge requests')).not.toBeInTheDocument();
  });

  it('shows the generic line when nothing has happened yet', () => {
    render(<AIMessageRenderer message={message('investigator') as never} subagentProgress={{}} />);
    expect(screen.getByText('subagents.processing')).toBeInTheDocument();
  });

  it('hides the instruction behind the expand', async () => {
    // It is the orchestrator talking to itself; it should not be
    // the most prominent thing in the box.
    const user = userEvent.setup();
    render(
      <AIMessageRenderer
        message={message('investigator') as never}
        subagentProgress={{ 'agent:investigator': INVESTIGATOR }}
      />,
    );
    expect(screen.queryByText('subagents.delegation')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { expanded: false }));
    expect(screen.getByText('subagents.delegation')).toBeInTheDocument();
  });
});
