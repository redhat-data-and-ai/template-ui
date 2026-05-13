import type { Message } from '@langchain/langgraph-sdk';

export type SSEChunk =
  | { type: 'token'; content: string; chunk_id: number }
  | { type: 'message'; content: Message; chunk_id: number }
  | { type: 'interrupt'; content: { value: string; resumable: boolean }; chunk_id: number };

export type SSEEvent =
  | { kind: 'chunk'; data: SSEChunk }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse `data:` payload into an SSEChunk or null if invalid. */
function parseSSEChunkPayload(parsed: unknown): SSEChunk | null {
  if (!isRecord(parsed)) return null;
  const type = parsed.type;
  if (type !== 'token' && type !== 'message' && type !== 'interrupt') return null;
  const chunkIdRaw = parsed.chunk_id;
  if (typeof chunkIdRaw !== 'number' || !Number.isFinite(chunkIdRaw)) {
    return null;
  }
  const contentUnknown = parsed.content;

  if (type === 'token') {
    if (typeof contentUnknown !== 'string') return null;
    return { type: 'token', content: contentUnknown, chunk_id: chunkIdRaw };
  }

  if (type === 'interrupt') {
    if (!isRecord(contentUnknown)) return null;
    return {
      type: 'interrupt',
      content: {
        value: typeof contentUnknown.value === 'string' ? contentUnknown.value : '',
        resumable: contentUnknown.resumable === true,
      },
      chunk_id: chunkIdRaw,
    };
  }

  if (typeof contentUnknown !== 'object' || contentUnknown === null) {
    return null;
  }

  return {
    type: 'message',
    content: contentUnknown as Message,
    chunk_id: chunkIdRaw,
  };
}

/**
 * Extract concatenated `data:` field from one SSE event block (between blank lines).
 */
function extractDataPayload(block: string): string | null {
  const lines = block.split('\n');
  const parts: string[] = [];
  for (const line of lines) {
    if (line.startsWith(':')) continue;
    const trimmedEnd = line.trimEnd();
    if (trimmedEnd === '') continue;
    if (!trimmedEnd.startsWith('data:')) continue;
    const payload = trimmedEnd.slice('data:'.length);
    parts.push(payload.startsWith(' ') ? payload.slice(1) : payload);
  }
  if (parts.length === 0) return null;
  return parts.join('\n');
}

export class SSEProcessor {
  private buffer = '';

  /**
   * Feed decoded text from a ReadableStream chunk; returns all complete SSE events parsed so far.
   */
  feed(text: string): SSEEvent[] {
    this.buffer += text;
    const events: SSEEvent[] = [];
    const segments = this.buffer.split('\n\n');
    this.buffer = segments.pop() ?? '';

    for (const segment of segments) {
      const trimmed = segment.trim();
      if (trimmed === '') continue;

      const dataPayload = extractDataPayload(trimmed);
      if (dataPayload === null) continue;

      const normalized = dataPayload.trim();
      if (normalized === '[DONE]' || normalized === 'DONE') {
        events.push({ kind: 'done' });
        continue;
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(normalized) as unknown;
      } catch {
        events.push({
          kind: 'error',
          message: 'Malformed SSE chunk: invalid JSON',
        });
        continue;
      }

      const chunk = parseSSEChunkPayload(parsed);
      if (chunk === null) {
        events.push({
          kind: 'error',
          message: 'Malformed SSE chunk: invalid message shape',
        });
        continue;
      }

      events.push({ kind: 'chunk', data: chunk });
    }

    return events;
  }

  reset(): void {
    this.buffer = '';
  }
}
