/**
 * A delegation as a list of steps, built from the progress stream.
 *
 * The box used to show the subagent's streamed prose. That was the
 * wrong content: a report is long, starts with preamble, and the
 * orchestrator relays it in the answer anyway — so the reader got a
 * wall of text twice and still could not tell how far along it was.
 *
 * What they want while waiting is what it is *doing*. The stream
 * already carries that: each tool call arrives as an `activity`,
 * and prose arriving means it has finished calling things and
 * started writing.
 *
 * Accumulated here rather than in the component so the arithmetic
 * is testable and the component stays a renderer.
 */

/** The pseudo-step for "the subagent is writing its answer". */
export const WRITING = '__writing__';

export interface Step {
  /** Tool name, or {@link WRITING}. */
  tool: string;
  /**
   * Tool-call id, the identity of a step.
   *
   * The stream's chunks are cumulative, so the same call arrives
   * again on every chunk. Keying on the label instead produced a
   * fresh step each time and a list that read
   * "a", "a, b", "a, b, c".
   */
  id: string;
  startedAt: number;
  /** Unset while the step is still running. */
  endedAt?: number;
}

export interface DelegationProgress {
  ns: string;
  agent?: string;
  instruction?: string;
  latest?: string;
  steps: Step[];
  startedAt: number;
}

export interface ProgressEvent {
  ns: string;
  agent?: string;
  instruction?: string;
  latest?: string;
  /** Every tool call emitted so far, cumulative. */
  calls?: { id: string; name: string }[];
  node?: string;
}

/**
 * Fold one progress event into a delegation's state.
 *
 * Pure, and returns a new object, so React sees a change.
 */
export function applyProgress(
  previous: DelegationProgress | undefined,
  event: ProgressEvent,
  now: number,
): DelegationProgress {
  const base: DelegationProgress =
    previous ?? { ns: event.ns, steps: [], startedAt: now };

  const steps = [...base.steps];
  const seen = new Set(steps.map((s) => s.id));

  const closeOpen = () => {
    for (let i = 0; i < steps.length; i += 1) {
      if (steps[i].endedAt === undefined) steps[i] = { ...steps[i], endedAt: now };
    }
  };

  // Only calls we have not seen before. The chunks repeat every
  // call made so far, so without the id check each chunk would add
  // the whole list again.
  const fresh = (event.calls ?? []).filter((c) => !seen.has(c.id));
  if (fresh.length > 0) {
    // A new call means whatever was running has returned: the
    // stream carries no completion event, so the next call is the
    // only signal.
    closeOpen();
    for (const call of fresh) steps.push({ tool: call.name, id: call.id, startedAt: now });
  } else if (event.latest && !seen.has(WRITING)) {
    // Prose means the calling is done and the answer is being
    // written. Once only; later chunks extend the same step.
    closeOpen();
    steps.push({ tool: WRITING, id: WRITING, startedAt: now });
  }

  return {
    ...base,
    agent: event.agent ?? base.agent,
    instruction: event.instruction ?? base.instruction,
    // Cumulative chunks: the newest is the whole text so far.
    latest: event.latest ?? base.latest,
    steps,
  };
}

/**
 * Close every running step, for when the delegation finishes.
 *
 * Every, not just the last: several calls can be emitted at once
 * and all of them are open until something closes them.
 */
export function finishSteps(progress: DelegationProgress, now: number): Step[] {
  return progress.steps.map((s) => (s.endedAt === undefined ? { ...s, endedAt: now } : s));
}

/** `1.2s`, or `1m 04s` past a minute. */
export function formatDuration(ms: number): string {
  if (ms < 0) return '0.0s';
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** `0:42` — a running clock, not a precise measurement. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
