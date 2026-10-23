/**
 * Turn a nested-graph SSE event into one line of visible progress.
 *
 * A delegated turn can run for well over a minute with nothing on
 * screen, because a `task` tool call is opaque from outside: the
 * orchestrator waits, the subagent works, and the user sees a
 * spinner. Aegra will stream the nested graph when asked
 * (`stream_subgraphs`), namespaced as `updates|tools:<id>`.
 *
 * What comes back is the subagent's own working state — its
 * instruction, the nodes it runs, its draft reply. None of that is
 * the answer, so it is summarised to a status line rather than
 * forwarded as content.
 */

export interface SubagentProgress {
  /** Opaque namespace, stable for the life of one delegation. */
  ns: string;
  /** Graph node that just ran, when the event names one. */
  node?: string;
  /**
   * The instruction this subagent was given, from its first message.
   *
   * The namespace id does not match the parent's tool-call id, so
   * this is the only reliable way to tell two concurrent
   * delegations apart — it matches the `description` the
   * orchestrator passed to `task`.
   */
  instruction?: string;
  /** Latest text the subagent produced, trimmed for a status line. */
  latest?: string;
}

const MAX_LINE = 160;

function firstText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        p && typeof p === 'object' && 'text' in p ? String((p as { text: unknown }).text) : '',
      )
      .join(' ')
      .trim();
  }
  return '';
}

/** Summarise one namespaced event, or null when it says nothing useful. */
export function summariseSubagentEvent(
  ns: string,
  payload: Record<string, unknown>,
): SubagentProgress | null {
  const out: SubagentProgress = { ns };

  // `values` events carry the whole message list; `updates` carry
  // one node's output keyed by node name.
  const messages = (payload.messages ?? null) as unknown;
  if (Array.isArray(messages)) {
    for (const m of messages) {
      if (!m || typeof m !== 'object') continue;
      const msg = m as { type?: string; content?: unknown };
      const text = firstText(msg.content);
      if (!text) continue;
      if (msg.type === 'human' && !out.instruction) out.instruction = text.slice(0, MAX_LINE);
      if (msg.type === 'ai') out.latest = text.slice(0, MAX_LINE);
    }
  } else {
    for (const [node, value] of Object.entries(payload)) {
      out.node = node;
      if (value && typeof value === 'object' && 'messages' in value) {
        const nested = (value as { messages?: unknown }).messages;
        if (Array.isArray(nested)) {
          for (const m of nested) {
            const text = firstText((m as { content?: unknown })?.content);
            if (text) out.latest = text.slice(0, MAX_LINE);
          }
        }
      }
      break;
    }
  }

  // A bare namespace tells the reader nothing. Only emit when the
  // event actually moved something forward.
  if (!out.node && !out.instruction && !out.latest) return null;
  return out;
}
