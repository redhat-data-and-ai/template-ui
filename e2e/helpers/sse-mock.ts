import type { Page, Route } from '@playwright/test';

/** Serialise one `data:` line for a token chunk the SSEProcessor accepts. */
export function tokenChunk(text: string, chunkId: number): string {
  return `data: ${JSON.stringify({ type: 'token', content: text, chunk_id: chunkId })}\n\n`;
}

/** Serialise one `data:` line for an interrupt chunk the SSEProcessor accepts. */
export function interruptChunk(value: object | string, chunkId: number): string {
  return `data: ${JSON.stringify({
    type: 'interrupt',
    content: { value, resumable: true },
    chunk_id: chunkId,
  })}\n\n`;
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

/** Mock the agent health endpoint to return healthy so retry logic runs normally. */
export async function mockAgentHealthy(page: Page): Promise<void> {
  await page.route('**/api/health/agent', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'healthy' }),
    }),
  );
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

/**
 * Intercept with a stream containing syntactically invalid SSE token data.
 * The SSEProcessor should skip unrecognised chunks without crashing the UI.
 */
export async function mockMalformedStream(page: Page): Promise<void> {
  await page.route('**/api/proxy/agent/v1/stream', (route) => {
    // Mix valid and invalid JSON; the SSEProcessor must tolerate both gracefully.
    const body =
      'data: {this is not valid json}\n\n' +
      tokenChunk('partial ok', 0) +
      'data: !!INVALID!!\n\n' +
      'data: [DONE]\n\n';
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

/**
 * Intercept the streaming endpoint and return the given HTTP error status.
 * Useful for testing auth-failure (401) and server-error (500+) paths.
 */
export async function mockStreamError(page: Page, status: number): Promise<void> {
  await page.route('**/api/proxy/agent/v1/stream', (route) =>
    route.fulfill({
      status,
      body: `HTTP ${status}`,
    }),
  );
}

/**
 * Intercept the streaming endpoint and return a single interrupt chunk.
 * The interrupt value can be a plain string (generic) or an HITLInterruptValue object.
 */
export async function mockInterruptStream(
  page: Page,
  value: object | string,
): Promise<void> {
  await page.route('**/api/proxy/agent/v1/stream', (route) => {
    const body = interruptChunk(value, 0) + 'data: [DONE]\n\n';
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

/**
 * Override the streaming endpoint for a resume request to return a simple
 * token response. Intercepts only the NEXT call — the route is unregistered
 * after it fires once, so subsequent stream requests fall through to any
 * previously registered handlers.
 */
export async function mockResumeStream(page: Page, responseText: string): Promise<void> {
  const handler = async (route: Route) => {
    // Unregister before fulfilling so only the first matching request is intercepted
    await page.unroute('**/api/proxy/agent/v1/stream', handler);
    const body = tokenChunk(responseText, 0) + 'data: [DONE]\n\n';
    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body,
    });
  };
  await page.route('**/api/proxy/agent/v1/stream', handler);
}

/**
 * Intercept the streaming endpoint and return HTTP 429 with a Retry-After header.
 * Used for testing the rate-limit UI.
 */
export async function mockRateLimitResponse(page: Page, retryAfterSeconds = 5): Promise<void> {
  await page.route('**/api/proxy/agent/v1/stream', (route) =>
    route.fulfill({
      status: 429,
      headers: {
        'Retry-After': String(retryAfterSeconds),
        'Content-Type': 'text/plain',
      },
      body: 'Rate limited',
    }),
  );
}
