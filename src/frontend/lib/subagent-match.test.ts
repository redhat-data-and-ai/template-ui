import { describe, expect, it } from 'vitest';
import { progressForDelegation } from './subagent-match';

const A = { ns: 'tools:a', instruction: 'Check GitLab for open merge requests' };
const B = { ns: 'tools:b', instruction: 'Check the calendar for Monday' };

describe('progressForDelegation', () => {
  it('returns nothing when no subagent is streaming', () => {
    expect(progressForDelegation([], 'anything')).toBeUndefined();
  });

  it('uses the lone entry without comparing text', () => {
    // The common case. Matching on text would fail whenever the
    // subagent rephrased the instruction it was given.
    expect(progressForDelegation([A], 'something else entirely')).toBe(A);
  });

  it('picks the matching delegation when two run at once', () => {
    // The namespace id and the parent tool-call id are unrelated,
    // so the instruction is the only shared handle.
    expect(progressForDelegation([A, B], 'Check the calendar for Monday')).toBe(B);
  });

  it('matches when the subagent wrapped the instruction in framing', () => {
    const wrapped = {
      ns: 'tools:c',
      instruction: 'You are a curator. Check GitLab for open merge requests. Report back.',
    };
    expect(progressForDelegation([wrapped, B], 'Check GitLab for open merge requests')).toBe(
      wrapped,
    );
  });

  it('ignores case and whitespace differences', () => {
    expect(progressForDelegation([A, B], '  check   GITLAB for open merge requests ')).toBe(A);
  });

  it('returns nothing rather than guessing when nothing matches', () => {
    expect(progressForDelegation([A, B], 'Summarise the thread')).toBeUndefined();
  });
});

describe('matching by subagent name', () => {
  const CURATOR = { ns: 'agent:curator', agent: 'curator', latest: 'catalogue results' };
  const WORKSPACE = { ns: 'agent:workspace', agent: 'workspace', latest: 'calendar results' };

  it('matches on the agent name exactly', () => {
    // `lc_agent_name` on the stream is the same value as
    // `args.subagent_type` on the task call, so this is exact where
    // instruction matching is a guess.
    expect(progressForDelegation([CURATOR, WORKSPACE], null, 'workspace')).toBe(WORKSPACE);
  });

  it('prefers the name over a text match', () => {
    const misleading = { ns: 'tools:x', instruction: 'Check the calendar', latest: 'x' };
    expect(
      progressForDelegation([misleading, WORKSPACE], 'Check the calendar', 'workspace'),
    ).toBe(WORKSPACE);
  });

  it('falls back to text when no entry carries that name', () => {
    const byText = { ns: 'tools:y', instruction: 'Check the calendar', latest: 'x' };
    expect(progressForDelegation([byText, CURATOR], 'Check the calendar', 'workspace')).toBe(
      byText,
    );
  });

  it('still returns the lone entry when nothing identifies it', () => {
    const lone = { ns: 'tools:z', latest: 'working' };
    expect(progressForDelegation([lone], 'anything', 'workspace')).toBe(lone);
  });
});

describe('the two progress channels, as they actually arrive', () => {
  // Observed on the wire: namespaced `updates` give the node under
  // `tools:<uuid>` with no agent; nested `messages` give the text
  // under `agent:<name>`. Both are present at once, so the single-
  // entry shortcut does not apply and the name is what resolves it.
  const FROM_UPDATES = {
    ns: 'tools:2b5964d7-a215-2ccf-9ddf-0e1dc975bd19',
    node: 'PatchToolCallsMiddleware.before_agent',
  };
  const FROM_MESSAGES = {
    ns: 'agent:summariser',
    agent: 'summariser',
    latest: 'Workpilot is a work assistant designed for Red Hat',
  };

  it('picks the entry carrying the streamed text', () => {
    expect(
      progressForDelegation([FROM_UPDATES, FROM_MESSAGES], 'Write three sentences', 'summariser'),
    ).toBe(FROM_MESSAGES);
  });

  it('would have failed without the agent name', () => {
    // Regression guard. The agent field was dropped in SSEProcessor,
    // so the box fell back to instruction text — which neither entry
    // carries — and showed the generic "processing" line instead of
    // the stream.
    expect(
      progressForDelegation([FROM_UPDATES, FROM_MESSAGES], 'Write three sentences', undefined),
    ).toBeUndefined();
  });
});
