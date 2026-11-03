import { buildAppPath } from "../lib/app-paths";

export interface SubagentOption {
  name: string;
  description: string;
}

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function slashTokenPattern(): RegExp {
  return /(?:^|\s)\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})(?=\s|$)/g;
}

/** The `/name` token the caret is inside, when `/` starts that word. */
export function activeSlashQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const safeCaret = Math.max(0, Math.min(caret, text.length));
  let start = safeCaret;
  while (start > 0 && !/\s/.test(text[start - 1])) start -= 1;
  if (text[start] !== "/") return null;
  const query = text.slice(start + 1, safeCaret);
  if (!/^[A-Za-z0-9_-]*$/.test(query)) return null;
  return { start, query };
}

export function filterSubagents(items: SubagentOption[], query: string): SubagentOption[] {
  const prefix = query.toLowerCase();
  return items.filter((item) => item.name.toLowerCase().startsWith(prefix));
}

/** Replace the slash token with `/name ` and leave the caret after it. */
export function applySlashSelection(
  text: string,
  start: number,
  name: string,
): { value: string; caret: number } {
  let end = start;
  while (end < text.length && !/\s/.test(text[end])) end += 1;
  const nextIsSpace = end < text.length && /\s/.test(text[end]);
  const insertion = nextIsSpace ? `/${name}` : `/${name} `;
  const value = text.slice(0, start) + insertion + text.slice(end);
  const caret = start + insertion.length + (nextIsSpace ? 1 : 0);
  return { value, caret };
}

/** Every finished `/name` in the message, in order, without duplicates. */
export function slashTokens(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(slashTokenPattern())) {
    const name = match[1];
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

export interface MentionPart {
  text: string;
  marked: boolean;
}

export function subagentMentionsOf(message: {
  additional_kwargs?: Record<string, unknown>;
}): string[] {
  const raw = message.additional_kwargs?.subagent_mentions;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/** Mark `/name` only when that name was saved on the message at send time. */
export function highlightSubagentMentions(text: string, names: readonly string[]): MentionPart[] {
  if (!names.length) return [{ text, marked: false }];
  const known = new Set(names);
  const parts: MentionPart[] = [];
  let last = 0;
  for (const match of text.matchAll(slashTokenPattern())) {
    const name = match[1];
    if (!known.has(name) || match.index == null) continue;
    const slashAt = match.index + match[0].length - name.length - 1;
    if (slashAt > last) parts.push({ text: text.slice(last, slashAt), marked: false });
    parts.push({ text: `/${name}`, marked: true });
    last = slashAt + name.length + 1;
  }
  if (last < text.length) parts.push({ text: text.slice(last), marked: false });
  return parts.length > 0 ? parts : [{ text, marked: false }];
}

export function parseSubagentCatalog(payload: unknown): SubagentOption[] {
  if (!payload || typeof payload !== "object") return [];
  const list = (payload as { subagents?: unknown }).subagents;
  if (!Array.isArray(list)) return [];
  const items: SubagentOption[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const name = (entry as { name?: unknown }).name;
    if (typeof name !== "string" || !NAME_PATTERN.test(name)) continue;
    const description = (entry as { description?: unknown }).description;
    items.push({
      name,
      description: typeof description === "string" ? description : "",
    });
  }
  return items;
}

/** Attach the send-time subagent names to the latest human message. */
export function messageWithSubagentMentions<T extends { type?: string; additional_kwargs?: Record<string, unknown> }>(
  messages: T[],
  names: string[],
): T[] {
  if (names.length === 0 || messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (last.type !== "human") return messages;
  const next = messages.slice();
  next[next.length - 1] = {
    ...last,
    additional_kwargs: {
      ...(last.additional_kwargs ?? {}),
      subagent_mentions: names,
    },
  };
  return next;
}

/** The subagents named in the user's text that are on the live list, in the order typed. */
export async function resolveRequestedSubagents(userText: string): Promise<string[]> {
  const tokens = slashTokens(userText);
  if (tokens.length === 0) return [];
  try {
    const response = await fetch(buildAppPath("/api/config/subagents"), { cache: "no-store" });
    if (!response.ok) return [];
    const known = new Set(parseSubagentCatalog(await response.json()).map((item) => item.name));
    return tokens.filter((token) => known.has(token));
  } catch {
    return [];
  }
}
