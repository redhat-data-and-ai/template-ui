import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SkillList } from '../SkillList';

/**
 * The capability list. Its job is to answer "what can this agent do"
 * without asking the agent, so the failure that matters is showing
 * nothing while looking like an empty answer.
 */
function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  } as Response);
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('SkillList', () => {
  it('lists each skill with its description and who uses it', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch({
        skills: [
          {
            name: 'incident-triage',
            description: 'Investigate a production alert.',
            agents: ['investigator', 'orchestrator'],
            attached: true,
          },
        ],
      }),
    );
    render(<SkillList />);

    expect(await screen.findByText('incident-triage')).toBeInTheDocument();
    expect(screen.getByText('Investigate a production alert.')).toBeInTheDocument();
    expect(screen.getByText(/investigator, orchestrator/)).toBeInTheDocument();
  });

  it('marks a skill that no agent uses', async () => {
    // A skill on disk attached to nothing is a file, not a
    // capability. Listing it unqualified would overstate the agent.
    vi.stubGlobal(
      'fetch',
      mockFetch({
        skills: [
          { name: 'orphan', description: '', agents: [], attached: false },
        ],
      }),
    );
    render(<SkillList />);

    expect(await screen.findByText('orphan')).toBeInTheDocument();
    expect(screen.getByText(/not attached/i)).toBeInTheDocument();
  });

  it('surfaces a failure instead of an empty list', async () => {
    // Silently rendering "no skills" for a 500 tells the reader the
    // agent can do nothing, which is a different and wrong answer.
    vi.stubGlobal('fetch', mockFetch({}, false, 500));
    render(<SkillList />);

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
  });

  it('survives a response that is not the shape it claims', async () => {
    vi.stubGlobal('fetch', mockFetch({ unexpected: true }));
    render(<SkillList />);

    expect(await screen.findByText(/no skills configured/i)).toBeInTheDocument();
  });
});

describe('SkillList — opening the source', () => {
  const openSkill = async () => {
    const userEvent = (await import('@testing-library/user-event')).default;
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          skills: [
            { name: 'incident-triage', description: 'd', agents: [], attached: true },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          name: 'incident-triage',
          files: [
            {
              path: 'SKILL.md',
              content: '---\nname: incident-triage\n---\n\n# Incident Triage\n\nBody text.',
              body: '# Incident Triage\n\nBody text.',
              frontmatter: { name: 'incident-triage', mcps: ['datadog', 'gitlab'] },
              truncated: false,
            },
            { path: 'references/writeup.md', content: 'ref', body: 'ref', truncated: false },
          ],
        }),
      } as Response);
    vi.stubGlobal('fetch', fetchMock);

    render(<SkillList />);
    await userEvent.click(
      await screen.findByRole('button', { name: /view incident-triage source/i }),
    );
    return userEvent;
  };

  it('renders the markdown rather than showing its syntax', async () => {
    await openSkill();
    // A heading, not the literal "# Incident Triage".
    expect(
      await screen.findByRole('heading', { name: 'Incident Triage' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('# Incident Triage')).not.toBeInTheDocument();
  });

  it('shows frontmatter separately from the prose', async () => {
    await openSkill();
    // Keys as a definition list above the body — the loader's
    // contract is a different kind of thing from the instructions.
    expect(await screen.findByText('mcps')).toBeInTheDocument();
    expect(screen.getByText('datadog')).toBeInTheDocument();
    expect(screen.getByText('gitlab')).toBeInTheDocument();
  });

  it('can fall back to the raw source', async () => {
    const userEvent = await openSkill();
    await screen.findByRole('heading', { name: 'Incident Triage' });

    await userEvent.click(screen.getByRole('button', { name: /source/i }));
    // Raw view shows the frontmatter delimiters the rendered one hides.
    expect(await screen.findByText(/name: incident-triage/)).toBeInTheDocument();
  });

  it('shows the files as a tree, not repeated paths', async () => {
    await openSkill();
    await screen.findByRole('heading', { name: 'Incident Triage' });

    // The folder is its own row and the file sits under it by name —
    // a flat list repeated "references/" on every row.
    expect(screen.getByRole('tree')).toBeInTheDocument();
    expect(screen.getByText('references')).toBeInTheDocument();
    expect(screen.getByText('writeup.md')).toBeInTheDocument();
    expect(screen.queryByText('references/writeup.md')).not.toBeInTheDocument();
  });

  it('collapses a folder', async () => {
    const userEvent = await openSkill();
    await screen.findByText('writeup.md');

    await userEvent.click(screen.getByText('references'));
    expect(screen.queryByText('writeup.md')).not.toBeInTheDocument();
  });

  it('stays read-only', async () => {
    await openSkill();
    expect(await screen.findByText(/read-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});
