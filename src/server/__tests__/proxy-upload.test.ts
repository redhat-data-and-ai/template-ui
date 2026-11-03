import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildTestServer } from './test-utils.js';
import { resetSettings } from '../utils/settings.js';

/**
 * Uploads must stream through the proxy, not sit in its heap.
 *
 * Buffering was the original implementation and it worked in every
 * test: one upload at a time is fine at any size. What it could not
 * survive was concurrency — a dozen simultaneous 50 MB files is
 * 600 MB of heap and an OOMKill on a 1 Gi pod, exactly when the thing
 * is busiest. These tests pin the properties that make that
 * impossible rather than trying to measure memory.
 */

const BOUNDARY = '----templateuitest';

function multipart(contentBytes: number): { body: Buffer; type: string } {
  const head = Buffer.from(
    `--${BOUNDARY}\r\n` +
      'Content-Disposition: form-data; name="files"; filename="a.txt"\r\n' +
      'Content-Type: text/plain\r\n\r\n',
  );
  const tail = Buffer.from(`\r\n--${BOUNDARY}--\r\n`);
  return {
    body: Buffer.concat([head, Buffer.alloc(contentBytes, 0x61), tail]),
    type: `multipart/form-data; boundary=${BOUNDARY}`,
  };
}

beforeEach(() => {
  process.env.FEATURE_AUTH_ENABLED = 'false';
  process.env.AUTH_ENABLED = 'false';
  process.env.AGENT_HOST = 'http://127.0.0.1:19999';
  resetSettings();
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.AGENT_HOST;
  delete process.env.AUTH_ENABLED;
  resetSettings();
});

describe('multipart upload proxying', () => {
  it('forwards the body as a stream rather than a buffer', async () => {
    // The regression this file exists for. A Buffer here means the
    // whole upload is resident for the life of the request.
    let forwarded: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options: RequestInit) => {
        forwarded = options.body;
        // Drain, so the request completes the way undici would.
        const source = options.body as AsyncIterable<Buffer>;
        if (source && typeof (source as any)[Symbol.asyncIterator] === 'function') {
          for await (const _chunk of source) {
            /* discard */
          }
        }
        return new Response('{"attachments":[]}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const server = await buildTestServer();
    const { body, type } = multipart(1024);
    const response = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/threads/t1/attachments',
      headers: { 'content-type': type },
      payload: body,
    });

    expect(response.statusCode).toBe(200);
    expect(Buffer.isBuffer(forwarded)).toBe(false);
    expect(forwarded).toBeTruthy();
    await server.close();
  });

  it('forwards the original content-type so the boundary survives', async () => {
    // Re-deriving the boundary is how a proxy corrupts an upload it
    // never looked at.
    let sentType: string | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options: RequestInit) => {
        sentType = (options.headers as Record<string, string>)['Content-Type'];
        const source = options.body as AsyncIterable<Buffer>;
        if (source && typeof (source as any)[Symbol.asyncIterator] === 'function') {
          for await (const _chunk of source) {
            /* discard */
          }
        }
        return new Response('{}', { status: 200 });
      }),
    );

    const server = await buildTestServer();
    const { body, type } = multipart(64);
    await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/threads/t1/attachments',
      headers: { 'content-type': type },
      payload: body,
    });

    expect(sentType).toContain(`boundary=${BOUNDARY}`);
    await server.close();
  });

  it('still carries JSON bodies as JSON', async () => {
    // The streaming parser is registered for multipart only; this is
    // the guard against it swallowing everything else.
    let sent: unknown;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options: RequestInit) => {
        sent = options.body;
        return new Response('{"ok":true}', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );

    const server = await buildTestServer();
    const response = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/threads',
      payload: { metadata: { title: 'hi' } },
    });

    expect(response.statusCode).toBe(200);
    expect(typeof sent).toBe('string');
    expect(JSON.parse(sent as string)).toEqual({ metadata: { title: 'hi' } });
    await server.close();
  });

  it('rejects an oversized upload with 413, not 502', async () => {
    // Streaming removes Fastify's bodyLimit, so the cap is re-imposed
    // by hand. Without this test, the fix would have traded an OOM
    // for an unbounded upload.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options: RequestInit) => {
        const source = options.body as AsyncIterable<Buffer>;
        for await (const _chunk of source) {
          /* drain until the counter throws */
        }
        return new Response('{}', { status: 200 });
      }),
    );

    const server = await buildTestServer();
    // One byte over the proxy's 60 MB ceiling.
    const { body, type } = multipart(61 * 1024 * 1024);
    const response = await server.inject({
      method: 'POST',
      url: '/api/proxy/agent/threads/t1/attachments',
      headers: { 'content-type': type },
      payload: body,
    });

    // 413 names the real problem; 502 would send someone to check an
    // agent that is perfectly healthy.
    expect(response.statusCode).toBe(413);
    expect(response.json().error).toMatch(/larger than/i);
    await server.close();
  });
});
