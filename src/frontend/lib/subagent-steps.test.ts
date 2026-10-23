import { describe, expect, it } from 'vitest';
import {
  applyProgress,
  finishSteps,
  formatDuration,
  formatElapsed,
  WRITING,
} from './subagent-steps';

/** Tool calls as the stream sends them: cumulative, id per call. */
const calls = (...names: string[]) => names.map((n) => ({ id: `id-${n}`, name: n }));
const ev = (o: Record<string, unknown>) => ({ ns: 'agent:x', ...o });

describe('applyProgress', () => {
  it('opens a step for the first tool call', () => {
    const p = applyProgress(undefined, ev({ calls: calls('gitlab_whoami') }), 1000);
    expect(p.steps).toEqual([
      { tool: 'gitlab_whoami', id: 'id-gitlab_whoami', startedAt: 1000 },
    ]);
  });

  it('does not repeat a call it has already seen', () => {
    // The chunks are cumulative, so the same call arrives on every
    // one. Keying on the label gave "a", then "a, b", then
    // "a, b, c" as three separate steps — the duplication.
    let p = applyProgress(undefined, ev({ calls: calls('a') }), 1000);
    p = applyProgress(p, ev({ calls: calls('a') }), 1500);
    p = applyProgress(p, ev({ calls: calls('a') }), 1800);
    expect(p.steps).toHaveLength(1);
  });

  it('adds only the calls it has not seen', () => {
    let p = applyProgress(undefined, ev({ calls: calls('a') }), 1000);
    p = applyProgress(p, ev({ calls: calls('a', 'b') }), 1500);
    p = applyProgress(p, ev({ calls: calls('a', 'b', 'c') }), 2000);
    expect(p.steps.map((s) => s.tool)).toEqual(['a', 'b', 'c']);
  });

  it('closes a running step when a new call appears', () => {
    // No completion event exists on the stream, so the next call is
    // the only signal the last one returned.
    let p = applyProgress(undefined, ev({ calls: calls('a') }), 1000);
    p = applyProgress(p, ev({ calls: calls('a', 'b') }), 2200);
    expect(p.steps[0].endedAt).toBe(2200);
    expect(p.steps[1].endedAt).toBeUndefined();
  });

  it('opens one step per call when several arrive together', () => {
    const p = applyProgress(undefined, ev({ calls: calls('a', 'b') }), 1000);
    expect(p.steps).toHaveLength(2);
  });

  it('adds a writing step when prose starts', () => {
    let p = applyProgress(undefined, ev({ calls: calls('a') }), 1000);
    p = applyProgress(p, ev({ latest: 'Found 15 open' }), 3000);
    expect(p.steps[0].endedAt).toBe(3000);
    expect(p.steps[1].tool).toBe(WRITING);
  });

  it('extends the writing step rather than repeating it', () => {
    let p = applyProgress(undefined, ev({ latest: 'Found' }), 1000);
    p = applyProgress(p, ev({ latest: 'Found 15 open merge requests' }), 1500);
    expect(p.steps.filter((s) => s.tool === WRITING)).toHaveLength(1);
  });

  it('keeps the newest cumulative text', () => {
    let p = applyProgress(undefined, ev({ latest: 'Found' }), 1000);
    p = applyProgress(p, ev({ latest: 'Found 15' }), 1500);
    expect(p.latest).toBe('Found 15');
  });

  it('remembers the agent once seen', () => {
    let p = applyProgress(undefined, ev({ agent: 'investigator' }), 1000);
    p = applyProgress(p, ev({ calls: calls('a') }), 1100);
    expect(p.agent).toBe('investigator');
  });

  it('records when the delegation started', () => {
    expect(applyProgress(undefined, ev({ calls: calls('a') }), 7000).startedAt).toBe(7000);
  });

  it('returns a new object so React re-renders', () => {
    const first = applyProgress(undefined, ev({ calls: calls('a') }), 1000);
    expect(applyProgress(first, ev({ calls: calls('a', 'b') }), 2000)).not.toBe(first);
  });
});

describe('finishSteps', () => {
  it('closes a step still running', () => {
    const p = applyProgress(undefined, ev({ calls: calls('a') }), 1000);
    expect(finishSteps(p, 4000)[0].endedAt).toBe(4000);
  });

  it('leaves an already-closed step at its own time', () => {
    let p = applyProgress(undefined, ev({ calls: calls('a') }), 1000);
    p = applyProgress(p, ev({ calls: calls('a', 'b') }), 2000);
    expect(finishSteps(p, 9000)[0].endedAt).toBe(2000);
  });
});

describe('formatting', () => {
  it('shows sub-minute durations to a tenth', () => {
    expect(formatDuration(1234)).toBe('1.2s');
  });

  it('switches to minutes past sixty seconds', () => {
    expect(formatDuration(64_000)).toBe('1m 04s');
  });

  it('never shows a negative duration', () => {
    // Clock skew between events should not render as "-0.3s".
    expect(formatDuration(-300)).toBe('0.0s');
  });

  it('shows elapsed time as a clock', () => {
    expect(formatElapsed(42_000)).toBe('0:42');
    expect(formatElapsed(125_000)).toBe('2:05');
  });
});
