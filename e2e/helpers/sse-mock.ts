import type { Page } from '@playwright/test';

/** Serialise one `data:` line for a token chunk the SSEProcessor accepts. */
function tokenChunk(text: string, chunkId: number): string {
  return `data: ${JSON.stringify({ type: 'token', content: text, chunk_id: chunkId })}\n\n`;
}

/**
 * Install a browser-level route that intercepts the streaming endpoint and
 * returns a minimal SSE response containing the provided text.
 *
 * Because Playwright intercepts at the CDP network layer the request never
 * reaches the Fastify server, so no upstream AGENT_HOST calls are made.
 */
export async function mockAgentStream(page: Page, responseText: string): Promise<void> {
  await page.route('**/api/proxy/agent/v1/stream', (route) => {
    const body = tokenChunk(responseText, 0) + 'data: [DONE]\n\n';
    return route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body,
    });
  });
}

/** Intercept thread state requests (used when navigating to an existing chat). */
export async function mockThreadState(page: Page): Promise<void> {
  await page.route('**/api/proxy/agent/threads/*/state', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ messages: [], tasks: [] }),
    }),
  );
}
