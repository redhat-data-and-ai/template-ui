/**
 * Strip the <classification>...</classification> block injected by the BFF.
 * Handles both complete blocks (with closing tag) and truncated ones
 * (where Aegra truncates thread_name before the closing tag appears).
 */
export function stripClassification(text: string | undefined): string | undefined {
  if (!text) return text;
  const cleaned = text
    .replace(/<classification>[\s\S]*?<\/classification>\s*/g, '')
    .replace(/<classification>[\s\S]*/g, '')
    .trimStart();
  if (!cleaned) return undefined;
  return cleaned;
}
