/**
 * The marker the agent emits when a tool needs authorization.
 *
 * Kept out of the component so the parsing is testable on its own and
 * the component file exports only a component.
 */

export interface McpAuthRequest {
  mcpName: string;
  /** `not_connected` or `expired` — different sentences, different fixes. */
  reason: string;
}

// No URL here on purpose. The connect action is built from the server
// name — `startMcpOAuthConnect(mcpName)` asks the backend for a fresh
// authorize URL — so carrying an absolute one through the transcript
// bought nothing and shipped this deployment's own address
// (`http://localhost:8081/...` on a dev cluster) into message text
// that the model could, and did, copy into its answer.

/**
 * Machine-readable on purpose. The agent used to say "connect it in
 * Settings → Components → MCP" and leave the reader to go and do
 * that, three navigations from the sentence telling them to.
 */
const MARKER = /\[AUTH_REQUIRED mcp=([^\s\]]+) reason=([^\s\]]+)(?: url=[^\s\]]+)?\]/g;

/**
 * Read authorization requests off a message's provenance.
 *
 * The preferred source. `parseAuthRequests` below reads the text
 * marker instead, which only works when the model happens to quote
 * it verbatim — asked to list Jira issues with Atlassian
 * disconnected, it wrote its own "please connect Jira in Settings"
 * and dropped the marker entirely.
 */
export function authRequestsFromProvenance(
  provenance:
    | { auth_required?: Array<{ mcp_name: string; reason: string }> }
    | undefined,
  additionalKwargs?: {
    auth_required?: Array<{ mcp_name: string; reason: string }>;
  },
): McpAuthRequest[] {
  // `additional_kwargs` is where the agent stamps it, and it is what
  // survives aegra's own serializer; `provenance` is our derived
  // block and only appears on paths that use our serializer. Read
  // both, prefer whichever is populated.
  const raw = additionalKwargs?.auth_required ?? provenance?.auth_required ?? [];
  return raw.map((a) => ({
    mcpName: a.mcp_name,
    reason: a.reason,
  }));
}

/** Pull every authorization request out of an assistant message. */
export function parseAuthRequests(text: string): McpAuthRequest[] {
  const seen = new Set<string>();
  const out: McpAuthRequest[] = [];
  for (const m of text.matchAll(MARKER)) {
    const [, mcpName, reason] = m;
    // One turn can hit the same server from several tools; the reader
    // needs one button, not four.
    if (seen.has(mcpName)) continue;
    seen.add(mcpName);
    out.push({ mcpName, reason });
  }
  return out;
}

/**
 * A connect link the model wrote into its own prose.
 *
 * Matches the bare URL and the markdown link wrapping it, including
 * the parenthetical some models append — `[here](url) (opens in new
 * tab)` — so stripping does not leave a dangling fragment.
 */
const PROSE_CONNECT_LINK =
  /\[[^\]]*\]\(\s*<?https?:\/\/[^\s)]*\/mcp\/[^\s/)]+\/connect[^\s)]*>?\s*\)|<?https?:\/\/[^\s<>)]*\/mcp\/[^\s/)]+\/connect[^\s<>)]*>?/gi;

/**
 * Strip the markers, and any connect URL the model pasted, so the
 * prose reads normally.
 *
 * The URL is this deployment's own address. On a developer's cluster
 * that is `http://localhost:8081/...`, which is not reachable for
 * anyone reading the answer anywhere else — and the Connect button
 * rendered beside the message does the same job correctly. The
 * agent is told not to write one; this is the backstop for when it
 * does anyway.
 */
export function stripAuthMarkers(text: string): string {
  return text
    .replace(MARKER, '')
    .replace(PROSE_CONNECT_LINK, '')
    // Leftovers from the removed link: "visit ()" or "at ," and the
    // double spaces either side of the hole.
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([,.;)])/g, '$1');
}


/**
 * A system that authorized itself part-way through a turn.
 *
 * Tool lists are fixed when a run starts, so a server that becomes
 * reachable mid-turn cannot be queried until the next one. Left to
 * itself the agent spent 38s exploring for another way in and then
 * answered the question from a different system entirely.
 *
 * The interface retries instead, which is the one more turn the
 * answer actually needs.
 */
const TOOLS_RELOADED = /\[TOOLS_RELOADED mcp=([^\s\]]+)\]/g;

export function parseReloadedTools(text: string): string[] {
  if (!text) return [];
  const names = new Set<string>();
  for (const m of text.matchAll(TOOLS_RELOADED)) names.add(m[1]);
  return [...names];
}

/** Strip the marker so the sentence reads normally. */
export function stripReloadedMarkers(text: string): string {
  return text.replace(TOOLS_RELOADED, '').replace(/[ \t]{2,}/g, ' ').trimStart();
}
