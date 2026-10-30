/** Cursor-style `/subagent` caret helpers for the chat composer. */

import { buildAgentApiUrl } from "../lib/app-paths";
import { authenticatedFetch } from "../services/authenticated-fetch";

export interface SlashToken {
  /** Index of the `/` in the full text. */
  start: number;
  /** Text typed after `/`, up to the caret, with trailing sentence punctuation removed. */
  query: string;
}

export interface SubagentOption {
  name: string;
  description?: string;
}

/**
 * The `/query` the caret is inside, if `/` starts the text or follows whitespace.
 * `foo/bar` and `https://example.com/analyst` are not tokens.
 */
export function slashTokenAtCaret(text: string, caret: number): SlashToken | null {
  if (caret < 0 || caret > text.length) {
    return null;
  }
  const upto = text.slice(0, caret);
  const match = upto.match(/(?:^|\s)\/(\S*)$/);
  if (!match || match.index === undefined) {
    return null;
  }
  const query = (match[1] ?? "").replace(/[.,!?;:]+$/, "");
  const slashIndex = upto[match.index] === "/" ? match.index : match.index + 1;
  return { start: slashIndex, query };
}

export interface SlashTextPart {
  text: string;
  highlighted: boolean;
}

const SLASH_TOKEN = /(?:^|\s)\/\S+/g;
const TRAILING_PUNCTUATION = /[.,!?;:]+$/;

function strippedSlashName(raw: string): string {
  return raw.slice(1).replace(TRAILING_PUNCTUATION, "");
}

/**
 * Split composer text so a finished `/name` can be tinted.
 * The name must match the catalog exactly. A prefix such as `/pu` stays plain.
 */
export function slashHighlightParts(
  text: string,
  names: readonly string[],
): SlashTextPart[] {
  const known = new Set(names.map((name) => name.toLowerCase()));
  const ranges: { start: number; end: number }[] = [];
  SLASH_TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = SLASH_TOKEN.exec(text)) !== null) {
    const slash = match[0].indexOf("/");
    const start = match.index + slash;
    const raw = match[0].slice(slash);
    const name = strippedSlashName(raw);
    if (!known.has(name.toLowerCase())) continue;
    ranges.push({ start, end: start + 1 + name.length });
  }

  if (ranges.length === 0) return [{ text, highlighted: false }];

  const parts: SlashTextPart[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      parts.push({ text: text.slice(cursor, range.start), highlighted: false });
    }
    if (range.end > range.start) {
      parts.push({ text: text.slice(range.start, range.end), highlighted: true });
    }
    cursor = range.end;
  }
  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), highlighted: false });
  }
  return parts;
}

/** Catalog names written as a whole `/name` in `text`, in first-seen order. */
export function matchingSubagentNames(text: string, names: readonly string[]): string[] {
  const byLower = new Map(names.map((name) => [name.toLowerCase(), name]));
  const found: string[] = [];
  const seen = new Set<string>();
  for (const part of slashHighlightParts(text, names)) {
    if (!part.highlighted) continue;
    const canonical = byLower.get(part.text.slice(1).toLowerCase());
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    found.push(canonical);
  }
  return found;
}

/** Replace the whole `/token` at slashIndex with `/name ` and a trailing space. */
export function applySubagentName(
  text: string,
  slashIndex: number,
  name: string,
): { value: string; caret: number } {
  let end = slashIndex + 1;
  while (end < text.length && !/\s/.test(text[end] ?? "")) end += 1;
  const insertion = `/${name} `;
  const rest = text[end] === " " ? text.slice(end + 1) : text.slice(end);
  return {
    value: text.slice(0, slashIndex) + insertion + rest,
    caret: slashIndex + insertion.length,
  };
}

/** Wrap each exact `/name` in `<u>` so markdown can underline it. */
export function underlineSubagentNames(text: string, names: readonly string[]): string {
  return slashHighlightParts(text, names)
    .map((part) => (part.highlighted ? `<u>${part.text}</u>` : part.text))
    .join("");
}

/** Case-insensitive substring filter. Preserves catalog order. */
export function filterSubagents(
  options: readonly SubagentOption[],
  query: string,
): SubagentOption[] {
  const needle = query.toLowerCase();
  return options.filter(
    (option) => needle.length === 0 || option.name.toLowerCase().includes(needle),
  );
}

/** Load the slash menu catalog. Callers fetch again on every open. */
export async function fetchMentionCatalog(): Promise<SubagentOption[]> {
  const response = await authenticatedFetch(buildAgentApiUrl("/mentions"), {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`mentions ${response.status}`);
  }
  const body = (await response.json()) as { subagents?: unknown };
  if (!Array.isArray(body.subagents)) {
    throw new Error("mentions payload");
  }
  return body.subagents.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }
    const name = (entry as { name?: unknown }).name;
    const description = (entry as { description?: unknown }).description;
    if (typeof name !== "string" || name.length === 0) {
      return [];
    }
    return [
      {
        name,
        description: typeof description === "string" ? description : undefined,
      },
    ];
  });
}
