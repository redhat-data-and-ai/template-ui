import { buildAgentApiUrl } from '../lib/app-paths';

export interface ThreadSearchHit {
  thread_id: string;
  title: string;
  rank: number;
  /** Matched text with the query terms wrapped in << >>. */
  snippet: string;
  updated_at: string | null;
}

export interface ThreadSearchResponse {
  query: string;
  count: number;
  results: ThreadSearchHit[];
}

/**
 * Full-text search across the caller's threads.
 *
 * The sidebar's existing filter matches titles and previews of threads
 * already loaded in the browser. This searches message bodies, server
 * side, including threads that were never loaded — which is the half
 * people actually mean by "search my chats".
 */
export async function searchThreads(
  query: string,
  signal?: AbortSignal,
): Promise<ThreadSearchResponse> {
  const url = buildAgentApiUrl(`/search/threads?q=${encodeURIComponent(query)}&limit=20`);
  const response = await fetch(url, { signal, cache: 'no-store' });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }
  return response.json();
}

/**
 * Split a `ts_headline` snippet into plain and highlighted runs.
 *
 * Postgres is configured to mark matches with `<<` and `>>` rather than
 * HTML — returning markup from the server and rendering it would be an
 * XSS hole fed directly by the user's own message content.
 */
export function parseSnippet(snippet: string): { text: string; match: boolean }[] {
  const parts: { text: string; match: boolean }[] = [];
  const pattern = /<<(.*?)>>/g;
  let cursor = 0;
  let found: RegExpExecArray | null;

  while ((found = pattern.exec(snippet)) !== null) {
    if (found.index > cursor) {
      parts.push({ text: snippet.slice(cursor, found.index), match: false });
    }
    parts.push({ text: found[1], match: true });
    cursor = found.index + found[0].length;
  }
  if (cursor < snippet.length) {
    parts.push({ text: snippet.slice(cursor), match: false });
  }
  return parts;
}
