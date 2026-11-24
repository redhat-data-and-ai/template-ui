/**
 * Split an assistant message into the private thought and the answer.
 * One reader for every provider. Callers never branch on the model name.
 *
 * Thoughts show up as:
 * - Claude: `{ type: "thinking", thinking: "..." }`
 * - Gemini: `{ type: "text", text: "...", thought: true }`
 * - others: `{ type: "reasoning", reasoning: "..." }` or `{ type: "thought", ... }`
 * - DeepSeek-style: `additional_kwargs.reasoning_content`
 * - plain text: `<think>` or `<thinking>` tags
 *
 * Encrypted `redacted_thinking` payloads and signature fields are skipped.
 * Strings are returned unchanged aside from lifting those tags, so a growing
 * stream stays a prefix of the next partial.
 */

const THINKING_TYPES = new Set(['thinking', 'reasoning', 'thought']);
const THINKING_KEYS = ['thinking', 'reasoning', 'summary', 'text'] as const;

export type MessageParts = {
  thinking: string;
  answer: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function splitTaggedText(text: string): MessageParts {
  const thinkingParts: string[] = [];
  let answer = text;
  const patterns = [
    /<think>([\s\S]*?)<\/think>/gi,
    /<thinking>([\s\S]*?)<\/thinking>/gi,
  ];
  for (const pattern of patterns) {
    answer = answer.replace(pattern, (_full, inner: string) => {
      if (inner) thinkingParts.push(inner);
      return '';
    });
  }
  answer = answer.replace(/<redacted_thinking>[\s\S]*?<\/redacted_thinking>/gi, '');
  const redactedOpen = answer.search(/<redacted_thinking/i);
  if (redactedOpen !== -1) {
    answer = answer.slice(0, redactedOpen);
  }
  const open = answer.search(/<(?:thinking|think)>/i);
  if (open !== -1) {
    const start = answer.indexOf('>', open);
    if (start !== -1) {
      const inner = answer.slice(start + 1);
      if (inner) thinkingParts.push(inner);
      answer = answer.slice(0, open);
    }
  }
  return { thinking: thinkingParts.join(''), answer };
}

function readThinkingText(block: Record<string, unknown>): string {
  for (const key of THINKING_KEYS) {
    const value = block[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return '';
}

function isThinkingBlock(block: Record<string, unknown>): boolean {
  if (block.type === 'redacted_thinking') return false;
  if (block.thought === true) return true;
  return typeof block.type === 'string' && THINKING_TYPES.has(block.type);
}

function splitBlocks(blocks: unknown[]): MessageParts {
  let thinking = '';
  let answer = '';
  for (const block of blocks) {
    if (typeof block === 'string') {
      const parts = splitTaggedText(block);
      thinking += parts.thinking;
      answer += parts.answer;
      continue;
    }
    if (!isRecord(block)) continue;
    if (block.type === 'redacted_thinking') continue;
    if (isThinkingBlock(block)) {
      thinking += readThinkingText(block);
      continue;
    }
    if (block.type === 'text' && typeof block.text === 'string') {
      answer += block.text;
    }
  }
  return { thinking, answer };
}

function reasoningFromKwargs(message: Record<string, unknown>): string {
  const kwargs = message.additional_kwargs;
  if (!isRecord(kwargs)) return '';
  if (typeof kwargs.reasoning_content === 'string') return kwargs.reasoning_content;
  if (typeof kwargs.reasoning === 'string') return kwargs.reasoning;
  return '';
}

function splitContent(content: unknown): MessageParts {
  if (typeof content === 'string') return splitTaggedText(content);
  if (Array.isArray(content)) return splitBlocks(content);
  if (content === undefined) return { thinking: '', answer: '' };
  if (content === null || typeof content === 'object') {
    return { thinking: '', answer: JSON.stringify(content) };
  }
  return { thinking: '', answer: String(content) };
}

export function splitMessageParts(message: unknown): MessageParts {
  if (typeof message === 'string' || Array.isArray(message) || !isRecord(message)) {
    return splitContent(message);
  }
  const parts = splitContent(message.content);
  if (!parts.thinking) {
    const extra = reasoningFromKwargs(message);
    if (extra) return { thinking: extra, answer: parts.answer };
  }
  return parts;
}
