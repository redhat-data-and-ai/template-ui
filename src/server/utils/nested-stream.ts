/**
 * Tell a subagent's token stream apart from the orchestrator's.
 *
 * With `stream_subgraphs` on, LangGraph streams a subagent's model
 * output through the *same* `messages` channel as the orchestrator's.
 * The event name is not namespaced — only `updates` gets the
 * `|tools:<id>` suffix — so without this the subagent's tokens are
 * appended to the transcript alongside the orchestrator's relay of
 * the same text. Both streams are cumulative, which is why the
 * symptom is the answer repeated, each copy a little longer.
 *
 * The namespace is announced once per run id in `messages/metadata`
 * and never repeated, so it has to be remembered:
 *
 *   orchestrator model   `model:<id>`              -> transcript
 *   orchestrator tools   `tools:<id>`              -> transcript
 *   subagent model       `tools:<id>|model:<id>`   -> progress only
 *
 * A `|` means one graph deeper than the main one. That is the whole
 * test.
 */

export class NestedStreamTracker {
  /** Run ids known to belong to a nested graph. */
  private readonly nested = new Set<string>();
  /** Run id -> the subagent that owns it, for progress labelling. */
  private readonly agentByRun = new Map<string, string>();

  /**
   * Record namespaces from a `messages/metadata` event.
   *
   * Shape is `{ "<run id>": { metadata: { langgraph_checkpoint_ns, lc_agent_name } } }`.
   */
  observeMetadata(payload: unknown): void {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
    for (const [runId, value] of Object.entries(payload as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const meta = (value as { metadata?: unknown }).metadata;
      if (!meta || typeof meta !== 'object') continue;
      const ns = (meta as { langgraph_checkpoint_ns?: unknown }).langgraph_checkpoint_ns;
      if (typeof ns !== 'string' || !ns.includes('|')) continue;
      this.nested.add(runId);
      const agent = (meta as { lc_agent_name?: unknown }).lc_agent_name;
      if (typeof agent === 'string' && agent) this.agentByRun.set(runId, agent);
    }
  }

  /** True when this `messages/*` payload came from a subagent. */
  isNested(payload: unknown): boolean {
    const runId = this.runIdOf(payload);
    return runId !== null && this.nested.has(runId);
  }

  /** The subagent that produced this payload, when known. */
  agentOf(payload: unknown): string | undefined {
    const runId = this.runIdOf(payload);
    return runId === null ? undefined : this.agentByRun.get(runId);
  }

  private runIdOf(payload: unknown): string | null {
    if (!Array.isArray(payload) || payload.length === 0) return null;
    const first = payload[0];
    if (!first || typeof first !== 'object') return null;
    const id = (first as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
}


/**
 * True for text that is really a serialised payload.
 *
 * A subagent's tool messages stream through the same channel as its
 * prose, and an MCP tool answers with JSON — a hundred lines of API
 * response dumped where the reader expects progress. Message type
 * filters most of it; this catches a model that relays a payload as
 * its own content.
 */
export function looksLikeJson(text: string): boolean {
  const t = text.trimStart();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  try {
    JSON.parse(text.trim());
    return true;
  } catch {
    // Half of a JSON blob mid-stream is unparseable and still must
    // not be rendered as prose, so an unclosed fragment that opens
    // with a brace counts — once it is long enough to be a payload
    // rather than a sentence that happens to start with one.
    return t.length > 40;
  }
}
