/**
 * Match streamed subagent progress to the delegation that produced it.
 *
 * The nested-graph namespace (`tools:<uuid>`) does not match the
 * parent's tool-call id (`call_337969`) — checked, they are
 * unrelated. The only thing shared between the two sides is the
 * instruction: the orchestrator passes `description` to `task`, and
 * the subagent's first human message is built from it.
 *
 * So the match is on text. That is weaker than an id and it is what
 * the protocol offers; a near-match is used rather than equality
 * because the subagent's prompt may wrap the description in
 * framing.
 */

/**
 * What the matcher needs. A superset arrives at runtime — see
 * {@link DelegationProgress} — and matching only reads these.
 */
export interface ProgressEntry {
  ns: string;
  node?: string;
  instruction?: string;
  latest?: string;
  /** Subagent name, when the stream identified one. */
  agent?: string;
  /** Tool calls emitted so far, when nothing is written yet. */
  calls?: { id: string; name: string }[];
}

function normalise(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Progress for one delegation, or undefined when none matches.
 *
 * With a single delegation in flight the lone entry is used without
 * comparing text — the common case, and matching would otherwise
 * fail whenever the subagent rephrased its instruction.
 */
export function progressForDelegation<T extends ProgressEntry>(
  entries: ReadonlyArray<T>,
  delegationText: string | null,
  subagentName?: string,
): T | undefined {
  if (entries.length === 0) return undefined;

  // By name first. `lc_agent_name` on the stream is the same value
  // as `args.subagent_type` on the parent's `task` call, so this is
  // an exact match where the text comparison below is a guess.
  if (subagentName) {
    const byName = entries.find((e) => e.agent === subagentName);
    if (byName) return byName;
  }

  if (entries.length === 1) return entries[0];
  if (!delegationText) return undefined;

  const target = normalise(delegationText);
  return entries.find((e) => {
    if (!e.instruction) return false;
    const instruction = normalise(e.instruction);
    return instruction.includes(target) || target.includes(instruction);
  });
}
