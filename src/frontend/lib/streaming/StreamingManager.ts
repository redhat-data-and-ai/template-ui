import type { Message } from '@langchain/langgraph-sdk';

import type { SSEEvent } from './SSEProcessor';
import { SSEProcessor } from './SSEProcessor';

export interface StreamRequest {
  message: string;
  threadId: string;
  userId: string;
  apiUrl: string;
  token?: string;
}

export type StreamStatus = 'idle' | 'connecting' | 'streaming' | 'error' | 'cancelled';

export interface InterruptPayload {
  value: string;
  resumable: boolean;
}

export type StreamCallback = {
  onToken: (content: string) => void;
  onMessage: (message: Message) => void;
  onInterrupt: (interrupt: InterruptPayload) => void;
  onError: (error: Error) => void;
  onStatusChange: (status: StreamStatus) => void;
  onDone: () => void;
};

export class StreamingManager {
  private abortController: AbortController | null = null;

  private processor = new SSEProcessor();

  private status: StreamStatus = 'idle';

  private processedChunkIds = new Set<number>();

  private setStatus(next: StreamStatus): void {
    this.status = next;
  }

  private handleEvents(events: SSEEvent[], callbacks: StreamCallback): void {
    for (const event of events) {
      switch (event.kind) {
        case 'done':
          break;
        case 'error':
          callbacks.onError(new Error(event.message));
          break;
        case 'chunk': {
          const { chunk_id: chunkId } = event.data;
          if (this.processedChunkIds.has(chunkId)) {
            break;
          }
          this.processedChunkIds.add(chunkId);

          if (event.data.type === 'token') {
            callbacks.onToken(event.data.content);
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

  async stream(request: StreamRequest, callbacks: StreamCallback): Promise<void> {
    this.cancel();
    this.processor.reset();
    this.processedChunkIds.clear();

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.setStatus('connecting');
    callbacks.onStatusChange('connecting');

    const streamUrl = request.apiUrl
      ? `${request.apiUrl}/v1/stream`
      : '/api/proxy/agent/v1/stream';

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (request.token) {
      headers['X-Token'] = request.token;
    }

    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

    try {
      const response = await fetch(streamUrl, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          message: request.message,
          thread_id: request.threadId || 'default-thread',
          session_id: request.threadId || 'default-session',
          user_id: request.userId,
          stream_tokens: true,
        }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

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

      this.setStatus('idle');
      callbacks.onStatusChange('idle');
      callbacks.onDone();
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
        callbacks.onError(err);
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
