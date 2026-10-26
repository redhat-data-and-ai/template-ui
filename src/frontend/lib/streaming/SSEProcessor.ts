import type { Message } from '@langchain/langgraph-sdk';
import type { HITLInterruptValue } from '@/types/deep-agent';

export type SSEChunk =
  | { type: 'token'; content: string; chunk_id: number; message_id?: string }
  | { type: 'draft_discard'; chunk_id: number }
  | { type: 'message'; content: Message; chunk_id: number }
  | { type: 'interrupt'; content: { value: HITLInterruptValue | string; resumable: boolean }; chunk_id: number };

export type McpStatusData = {
  tool: string;
  status: string;
};

/** Integrations the turn could not reach, for the inline Connect action. */
export type AuthRequiredPayload = Array<{ mcp_name: string; reason: string }>;

export type SSEMetadataPayload = {
  run_id: string;
  trace_id: string;
  thread_id: string;
};

export type SSEEvent =
  | { kind: 'chunk'; data: SSEChunk }
  | { kind: 'mcp_status'; data: McpStatusData }
  | { kind: 'subagent_progress'; data: SubagentProgressData }
  | { kind: 'metadata'; data: SSEMetadataPayload }
  | { kind: 'auth_required'; data: AuthRequiredPayload }
  | { kind: 'done' }
  | { kind: 'error'; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parse `data:` payload into an SSEChunk or null if invalid. */
function parseSSEChunkPayload(parsed: unknown): SSEChunk | null {
  if (!isRecord(parsed)) return null;
  const type = parsed.type;
  if (type === 'draft_discard') {
    const chunkId = parsed.chunk_id;
    if (typeof chunkId === 'number' && Number.isFinite(chunkId)) {
      return { type: 'draft_discard', chunk_id: chunkId };
    }
    return null;
  }
  if (type !== 'token' && type !== 'message' && type !== 'interrupt') return null;
  const chunkIdRaw = parsed.chunk_id;
  if (typeof chunkIdRaw !== 'number' || !Number.isFinite(chunkIdRaw)) {
    return null;
  }
  const contentUnknown = parsed.content;

  if (type === 'token') {
    if (typeof contentUnknown !== 'string') return null;
    const msgId = typeof parsed.message_id === 'string' ? parsed.message_id : undefined;
    return { type: 'token', content: contentUnknown, chunk_id: chunkIdRaw, message_id: msgId };
  }

  if (type === 'interrupt') {
    if (!isRecord(contentUnknown)) return null;
    let rawValue: unknown = contentUnknown.value;
    if (typeof rawValue === 'string') {
      try {
        rawValue = JSON.parse(rawValue);
      } catch {
        // non-JSON plain-text interrupt value — preserve as string
      }
    }
    return {
      type: 'interrupt',
      content: {
        value: (isRecord(rawValue) || typeof rawValue === 'string' ? rawValue : {}) as HITLInterruptValue | string,
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

/** First `event:` line in an SSE block, if any. */
function extractEventType(block: string): string | null {
  for (const line of block.split('\n')) {
    if (line.startsWith(':')) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith('event:')) {
      return trimmed.slice('event:'.length).trim();
    }
  }
  return null;
}

/**
 * One line of progress from a delegated subagent.
 *
 * A `task` call is opaque from outside: the orchestrator waits, the
 * subagent works for a minute or more, and the user sees a spinner
 * with no indication anything is happening.
 */
export interface SubagentProgressData {
  ns: string;
  node?: string;
  instruction?: string;
  latest?: string;
  /**
   * The subagent that produced this.
   *
   * The same value as `args.subagent_type` on the parent's `task`
   * call, so it matches the box exactly. Dropping it here left the
   * box matching on instruction text, which fails as soon as there
   * is more than one progress entry — and there are two, because
   * namespaced `updates` and nested `messages` arrive under
   * different keys.
   */
  agent?: string;
  /** Every tool call emitted so far, cumulative and id-keyed. */
  calls?: { id: string; name: string }[];
}

function parseSubagentProgress(
  parsed: unknown,
  eventType: string | null,
): SubagentProgressData | null {
  if (eventType !== 'subagent_progress' || !isRecord(parsed)) return null;
  const ns = typeof parsed.ns === 'string' ? parsed.ns : '';
  if (!ns) return null;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    ns,
    node: str(parsed.node),
    instruction: str(parsed.instruction),
    latest: str(parsed.latest),
    agent: str(parsed.agent),
    calls: Array.isArray(parsed.calls)
      ? (parsed.calls as unknown[]).flatMap((c) =>
          isRecord(c) && typeof c.id === 'string' && typeof c.name === 'string'
            ? [{ id: c.id, name: c.name }]
            : [],
        )
      : undefined,
  };
}

function parseMcpStatusPayload(parsed: unknown, eventType: string | null): McpStatusData | null {
  if (!isRecord(parsed)) return null;
  const isMcp = eventType === 'mcp_status' || parsed.type === 'mcp_status';
  if (!isMcp) return null;
  const tool = typeof parsed.tool === 'string' ? parsed.tool : 'unknown';
  const status = typeof parsed.status === 'string' ? parsed.status : 'unknown';
  return { tool, status };
}

function parseMetadataPayload(parsed: unknown): SSEMetadataPayload | null {
  if (!isRecord(parsed) || parsed.type !== 'metadata') return null;
  const content = parsed.content;
  if (!isRecord(content)) return null;
  const run_id = typeof content.run_id === 'string' ? content.run_id : '';
  const trace_id = typeof content.trace_id === 'string' ? content.trace_id : '';
  const thread_id = typeof content.thread_id === 'string' ? content.thread_id : '';
  if (!run_id || !trace_id || !thread_id) return null;
  return { run_id, trace_id, thread_id };
}

function parseAuthRequiredPayload(parsed: unknown): AuthRequiredPayload | null {
  if (!isRecord(parsed) || parsed.type !== 'auth_required') return null;
  const content = parsed.content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const out: AuthRequiredPayload = [];
  for (const entry of content) {
    if (!isRecord(entry)) continue;
    const mcp_name = typeof entry.mcp_name === 'string' ? entry.mcp_name : '';
    if (!mcp_name) continue;
    const reason = typeof entry.reason === 'string' ? entry.reason : 'not_connected';
    out.push({ mcp_name, reason });
  }
  return out.length > 0 ? out : null;
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

      const sseEventName = extractEventType(trimmed);

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

      const subagent = parseSubagentProgress(parsed, sseEventName);
      if (subagent) {
        events.push({ kind: 'subagent_progress', data: subagent });
        continue;
      }

      const mcpStatus = parseMcpStatusPayload(parsed, sseEventName);
      if (mcpStatus) {
        events.push({ kind: 'mcp_status', data: mcpStatus });
        continue;
      }

      const metadata = parseMetadataPayload(parsed);
      if (metadata) {
        events.push({ kind: 'metadata', data: metadata });
        continue;
      }

      const authRequired = parseAuthRequiredPayload(parsed);
      if (authRequired) {
        events.push({ kind: 'auth_required', data: authRequired });
        continue;
      }

      if (isRecord(parsed) && parsed.type === 'error') {
        const errMsg = typeof parsed.message === 'string' ? parsed.message : 'Agent stream error';
        events.push({ kind: 'error', message: errMsg });
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
