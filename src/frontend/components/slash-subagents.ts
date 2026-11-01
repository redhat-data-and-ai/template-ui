import { buildAppPath } from "../lib/app-paths";

export interface SubagentOption {
  name: string;
  description: string;
}

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const COMPLETE_SLASH = /(?:^|\s)\/([A-Za-z0-9][A-Za-z0-9_-]{0,63})(?=\s|$)/;

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

/** First finished `/name` in the message. A name still being typed does not count. */
export function firstSlashToken(text: string): string | null {
  const match = COMPLETE_SLASH.exec(text);
  return match?.[1] ?? null;
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

/** The subagent named by the first `/name` in the user's text, when that name is on the live list. */
export async function resolveRequestedSubagent(userText: string): Promise<string | undefined> {
  const token = firstSlashToken(userText);
  if (!token) return undefined;
  try {
    const response = await fetch(buildAppPath("/api/config/subagents"), { cache: "no-store" });
    if (!response.ok) return undefined;
    const items = parseSubagentCatalog(await response.json());
    return items.some((item) => item.name === token) ? token : undefined;
  } catch {
    return undefined;
  }
}
