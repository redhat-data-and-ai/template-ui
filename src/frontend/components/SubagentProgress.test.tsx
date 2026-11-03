import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SubagentProgress } from './SubagentProgress';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

describe('SubagentProgress', () => {
  it('shows nothing when no subagent is running', () => {
    const { container } = render(<SubagentProgress entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('labels a delegation by its instruction', () => {
    // The namespace id does not match the parent tool-call id, so
    // the instruction is the only label available.
    render(
      <SubagentProgress
        entries={[{ ns: 'tools:a', instruction: 'Check GitLab for open MRs' }]}
      />,
    );
    expect(screen.getByText(/Check GitLab for open MRs/)).toBeInTheDocument();
  });

  it('keeps two concurrent delegations apart', () => {
    render(
      <SubagentProgress
        entries={[
          { ns: 'tools:a', instruction: 'Check calendar' },
          { ns: 'tools:b', instruction: 'Check GitLab' },
        ]}
      />,
    );
    expect(screen.getByText(/Check calendar/)).toBeInTheDocument();
    expect(screen.getByText(/Check GitLab/)).toBeInTheDocument();
  });

  it('prefers the latest output over the node name', () => {
    render(
      <SubagentProgress
        entries={[{ ns: 'tools:a', node: 'model', latest: 'Found 3 merge requests' }]}
      />,
    );
    expect(screen.getByText(/Found 3 merge requests/)).toBeInTheDocument();
    expect(screen.queryByText(/model/)).not.toBeInTheDocument();
  });

  it('falls back to the node name before anything is produced', () => {
    render(<SubagentProgress entries={[{ ns: 'tools:a', node: 'model' }]} />);
    expect(screen.getByText(/model/)).toBeInTheDocument();
  });

  it('truncates a long draft to a status line', () => {
    render(
      <SubagentProgress entries={[{ ns: 'tools:a', latest: 'y'.repeat(400) }]} />,
    );
    expect(screen.getByTestId('subagent-progress').textContent!.length).toBeLessThan(200);
  });

  it('announces updates to screen readers without stealing focus', () => {
    render(<SubagentProgress entries={[{ ns: 'tools:a', node: 'model' }]} />);
    expect(screen.getByTestId('subagent-progress')).toHaveAttribute('aria-live', 'polite');
  });
});
