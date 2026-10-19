import type { Message } from '@langchain/langgraph-sdk';

import { parseRetryAfterSeconds, triggerRateLimit } from '@/services/authenticated-fetch';
import { unmarkChatAsClientCreated } from '@/services/newChatTracker';
import { buildAgentApiUrl } from '../app-paths';
import type { HITLInterruptValue } from '@/types/deep-agent';

import type { AuthRequiredPayload, SSEEvent, SubagentProgressData } from './SSEProcessor';
import { SSEProcessor } from './SSEProcessor';

export interface StreamRequest {
  message: string;
  threadId: string;
  userId: string;
  apiUrl: string;
  token?: string;
  projectId?: string | null;
  resume?: boolean;
  resumeDecisions?: Array<{ type: 'approve' | 'reject' | 'edit'; message?: string }>;
}

export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'error' | 'cancelled';

export interface InterruptPayload {
  value: HITLInterruptValue | string;
  resumable: boolean;
}

export type McpStreamStatusEvent = {
  tool: string;
  status: string;
  timestamp: number;
};

export type StreamMetadataPayload = {
  run_id: string;
  trace_id: string;
  thread_id: string;
};

export type StreamCallback = {
  onToken: (content: string, messageId?: string) => void;
  onDraftDiscard?: () => void;
  onMessage: (message: Message) => void;
  onInterrupt: (interrupt: InterruptPayload) => void;
  onError: (error: Error) => void | Promise<void>;
  onStatusChange: (status: StreamStatus) => void;
  onDone: () => void;
  onMcpStatus?: (event: McpStreamStatusEvent) => void;
  /** Progress from a delegated subagent, so a long `task` is not a blank wait. */
  onSubagentProgress?: (event: SubagentProgressData) => void;
  onMetadata?: (data: StreamMetadataPayload) => void;
  /** Integrations the turn could not reach, for the inline Connect action. */
  onAuthRequired?: (requests: AuthRequiredPayload) => void;
};

export class StreamingManager {
  private abortController: AbortController | null = null;

  private processor = new SSEProcessor();

  private status: StreamStatus = 'idle';

  private processedChunkIds = new Set<number>();

  private streamError: Error | null = null;

  private setStatus(next: StreamStatus): void {
    this.status = next;
  }

  private handleEvents(events: SSEEvent[], callbacks: StreamCallback): void {
    for (const event of events) {
      switch (event.kind) {
        case 'done':
          break;
        case 'error':
          this.streamError = new Error(event.message);
          void callbacks.onError(this.streamError);
          break;
        case 'subagent_progress': {
          callbacks.onSubagentProgress?.(event.data);
          break;
        }
        case 'mcp_status': {
          callbacks.onMcpStatus?.({
            tool: event.data.tool,
            status: event.data.status,
            timestamp: Date.now(),
          });
          break;
        }
        case 'metadata': {
          callbacks.onMetadata?.(event.data);
          break;
        }
        case 'auth_required': {
          callbacks.onAuthRequired?.(event.data);
          break;
        }
        case 'chunk': {
          const { chunk_id: chunkId } = event.data;
          if (this.processedChunkIds.has(chunkId)) {
            break;
          }
          this.processedChunkIds.add(chunkId);

          if (event.data.type === 'token') {
            callbacks.onToken(event.data.content, event.data.message_id);
          } else if (event.data.type === 'draft_discard') {
            callbacks.onDraftDiscard?.();
          } else if (event.data.type === 'interrupt') {
            callbacks.onInterrupt(event.data.content);
          } else {
            callbacks.onMessage(event.data.content);
          }
          break;
        }
      }
    }
  }

  /**
   * Attach to a run that is already executing on the agent.
   *
   * Same translated chunks as `stream`, so the callbacks are the
   * same: the reader cannot tell whether this browser started the
   * turn or walked back in on it.
   */
  async attach(
    args: { threadId: string; runId: string; apiUrl?: string },
    callbacks: StreamCallback,
  ): Promise<void> {
    // Never over the top of a live stream.
    //
    // Managers are per-thread singletons and `cancel()` is the first
    // thing an attach used to do, so a rejoin triggered while this
    // tab was already streaming killed the turn it was watching and
    // replaced it with a replay — which the caller's own
    // already-seen filter then discarded. The subagent box froze on
    // "Working" and only a refresh put it right.
    const status = this.getStatus();
    if (status === 'streaming' || status === 'connecting') {
      return;
    }
    this.cancel();
    this.processor.reset();
    this.processedChunkIds.clear();
    this.streamError = null;

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.setStatus('connecting');
    callbacks.onStatusChange('connecting');

    const url = args.apiUrl
      ? `${args.apiUrl}/v1/stream/attach`
      : buildAgentApiUrl('/v1/stream/attach');

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ thread_id: args.threadId, run_id: args.runId }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`Attach failed: ${response.status}`);
      }
      reader = response.body?.getReader();
      if (!reader) throw new Error('Failed to get reader from attach response');

      this.setStatus('streaming');
      callbacks.onStatusChange('streaming');

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (value !== undefined) {
          this.handleEvents(this.processor.feed(decoder.decode(value, { stream: true })), callbacks);
        }
        if (done) break;
      }

      const flush = decoder.decode();
      if (flush.length > 0) this.handleEvents(this.processor.feed(flush), callbacks);

      if (this.streamError) {
        this.setStatus('error');
        callbacks.onStatusChange('error');
      } else {
        this.setStatus('idle');
        callbacks.onStatusChange('idle');
        callbacks.onDone();
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown attach error');
      if (err.name === 'AbortError') {
        this.setStatus('cancelled');
        callbacks.onStatusChange('cancelled');
      } else {
        this.setStatus('error');
        callbacks.onStatusChange('error');
        await callbacks.onError(err);
      }
    } finally {
      reader?.releaseLock?.();
      this.abortController = null;
    }
  }

  async stream(request: StreamRequest, callbacks: StreamCallback): Promise<void> {
    this.cancel();
    this.processor.reset();
    this.processedChunkIds.clear();
    this.streamError = null;

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.setStatus('connecting');
    callbacks.onStatusChange('connecting');

    const streamUrl = request.apiUrl
      ? `${request.apiUrl}/v1/stream`
      : buildAgentApiUrl('/v1/stream');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (request.token) {
      headers['X-Token'] = request.token;
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const body: Record<string, unknown> = {
        message: request.resume
          ? (request.resumeDecisions?.length ? { decisions: request.resumeDecisions } : request.message)
          : request.message,
        thread_id: request.threadId || 'default-thread',
        session_id: request.threadId || 'default-session',
        user_id: request.userId,
        stream_tokens: true,
      };
      if (request.resume) body.resume = true;
      if (request.projectId) body.project_id = request.projectId;

      const response = await fetch(streamUrl, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          const retrySeconds = parseRetryAfterSeconds(response.headers.get('Retry-After'));
          triggerRateLimit(retrySeconds);
        }
        let errorMessage = `HTTP error! status: ${response.status}`;
        try {
          const body = await response.json() as Record<string, unknown>;
          if (typeof body?.message === 'string' && body.message.length > 0) {
            errorMessage = body.message;
          } else if (typeof body?.error === 'string' && body.error.length > 0) {
            errorMessage = body.error;
          } else if (typeof body?.detail === 'string' && body.detail.length > 0) {
            errorMessage = body.detail;
          }
        } catch {
          // Response body is not JSON or unreadable — keep generic message
        }
        const err: Error & { status?: number } = new Error(errorMessage);
        err.status = response.status;
        throw err;
      }

      unmarkChatAsClientCreated(request.threadId);

      reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get reader from response body');
      }

      this.setStatus('streaming');
      callbacks.onStatusChange('streaming');

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (value !== undefined) {
          const chunkText = decoder.decode(value, { stream: true });
          this.handleEvents(this.processor.feed(chunkText), callbacks);
        }
        if (done) {
          break;
        }
      }

      const flushText = decoder.decode();
      if (flushText.length > 0) {
        this.handleEvents(this.processor.feed(flushText), callbacks);
      }

      if (this.streamError) {
        this.setStatus('error');
        callbacks.onStatusChange('error');
      } else {
        this.setStatus('idle');
        callbacks.onStatusChange('idle');
        callbacks.onDone();
      }
    } catch (error: unknown) {
      let err: Error;
      if (error instanceof Error) {
        err = error;
      } else if (typeof error === 'string') {
        err = new Error(error);
      } else {
        try {
          err = new Error(JSON.stringify(error));
        } catch {
          err = new Error('Unknown stream error');
        }
      }

      if (err.name === 'AbortError') {
        this.setStatus('cancelled');
        callbacks.onStatusChange('cancelled');
      } else {
        this.setStatus('error');
        callbacks.onStatusChange('error');
        await callbacks.onError(err);
      }
    } finally {
      reader?.releaseLock?.();
      this.abortController = null;
    }
  }

  cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.processor.reset();
    this.processedChunkIds.clear();
    this.setStatus('idle');
  }

  getStatus(): StreamStatus {
    return this.status;
  }
}
