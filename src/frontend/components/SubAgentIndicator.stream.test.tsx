import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SubAgentIndicator } from './SubAgentIndicator';
import { WRITING, type DelegationProgress } from '../lib/subagent-steps';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string, o?: Record<string, unknown>) =>
      o?.node ? `${k}:${o.node}` : o?.tool ? `${k}:${o.tool}` : k,
  }),
}));

const delegating = {
  name: 'task',
  args: { subagent_type: 'curator', description: 'Check the catalogue' },
  id: 'call_1',
  content: null,
};

const progress = (over: Partial<DelegationProgress> = {}): DelegationProgress => ({
  ns: 'agent:curator',
  agent: 'curator',
  steps: [],
  startedAt: Date.now() - 42_000,
  ...over,
});

function renderBox(p?: DelegationProgress) {
  return render(
    <SubAgentIndicator
      toolCall={delegating as never}
      messageId="m1"
      index={0}
      progress={p}
    />,
  );
}

const open = () => userEvent.setup().click(screen.getByRole('button', { expanded: false }));

describe('SubAgentIndicator', () => {
  it('shows the steps, not the prose, while working', () => {
    // The report is long, opens with preamble, and the orchestrator
    // relays it in the answer anyway. What the reader needs while
    // waiting is what it is doing.
    renderBox(
      progress({
        steps: [
          { tool: 'gitlab_list_merge_requests', startedAt: 1000, endedAt: 2200 },
          { tool: 'gitlab_get_project', startedAt: 2200 },
        ],
      }),
    );
    // Collapsed, only the live operation — the finished one is
    // history and waits behind the chevron, so a subagent that makes
    // a dozen calls does not push the conversation off the screen.
    expect(screen.getByText('GitLab · get project')).toBeInTheDocument();
    expect(screen.queryByText('GitLab · list merge requests')).not.toBeInTheDocument();
  });

  it('keeps the full step history behind the chevron', async () => {
    const user = userEvent.setup();
    renderBox(
      progress({
        steps: [
          { tool: 'gitlab_list_merge_requests', startedAt: 1000, endedAt: 2200 },
          { tool: 'gitlab_get_project', startedAt: 2200 },
        ],
      }),
    );

    expect(screen.queryByTestId('subagent-timeline')).not.toBeInTheDocument();
    expect(screen.getByTestId('subagent-current-step')).toHaveTextContent('1/2');

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByTestId('subagent-timeline')).toBeInTheDocument();
    expect(screen.getByText('GitLab · list merge requests')).toBeInTheDocument();
  });

  it('times a finished step', () => {
    renderBox({
      ...progress(),
      steps: [{ tool: 'gitlab_get_project', startedAt: 1000, endedAt: 2200 }],
    });
    expect(screen.getByText('1.2s')).toBeInTheDocument();
  });

  it('marks the writing step distinctly from a tool call', () => {
    renderBox(progress({ steps: [{ tool: WRITING, startedAt: Date.now() }] }));
    expect(screen.getByText('subagents.writing')).toBeInTheDocument();
  });

  it('falls back to a generic line before any step', () => {
    renderBox(progress());
    expect(screen.getByText('subagents.processing')).toBeInTheDocument();
    expect(screen.queryByTestId('subagent-timeline')).not.toBeInTheDocument();
  });

  it('stays collapsed by default', () => {
    renderBox(progress({ steps: [{ tool: 'a', startedAt: 1000 }] }));
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  it('keeps the written output available on expand', async () => {
    renderBox(progress({ latest: 'Found three data products.', steps: [] }));
    await open();
    expect(screen.getByTestId('subagent-stream')).toHaveTextContent(
      'Found three data products.',
    );
  });

  it('shows no Result block before anything is written', async () => {
    renderBox(progress({ steps: [{ tool: 'a', startedAt: 1000 }] }));
    await open();
    expect(screen.queryByTestId('subagent-stream')).not.toBeInTheDocument();
  });

  it('works with no progress at all', () => {
    renderBox(undefined);
    expect(screen.getByText('subagents.processing')).toBeInTheDocument();
  });
});

describe('SubAgentIndicator — a turn that ended', () => {
  const stopped = (status: string) => ({
    name: 'task',
    args: { subagent_type: 'curator', description: 'Check the catalogue' },
    id: 'call_1',
    content: '',
    status,
  });

  function renderWith(toolCall: Record<string, unknown>) {
    return render(
      <SubAgentIndicator
        toolCall={toolCall as never}
        messageId="m1"
        index={0}
        progress={{
          ns: 'agent:curator',
          agent: 'curator',
          startedAt: Date.now() - 1_020_000,
          steps: [{ tool: 'dataverse_execute_sql', startedAt: 1000, endedAt: 23_100 }],
        }}
      />,
    );
  }

  it('stops claiming it is working after an error ends the turn', () => {
    // The reducer sets content to '' when there is no message, and
    // hasContent('') is false — so the box kept a live clock running
    // on a turn that had been over for seventeen minutes.
    renderWith(stopped('error'));

    expect(screen.queryByText(/subagents\.working/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('subagent-current-step')).not.toBeInTheDocument();
  });

  it('says stopped rather than failed when the user cancelled', () => {
    renderWith(stopped('cancelled'));

    expect(screen.getByText('subagents.stopped')).toBeInTheDocument();
  });

  it('still shows working while the call is genuinely open', () => {
    renderWith({
      name: 'task',
      args: { subagent_type: 'curator' },
      id: 'call_1',
      content: null,
    });

    expect(screen.getByText(/subagents\.working/)).toBeInTheDocument();
  });
});
