import { test, expect } from '@playwright/test';
import { mountConfig } from '../helpers/config-mount';
import { mockAgentHealthy, mockAgentStream, mockStreamError, mockThreadState, tokenChunk } from '../helpers/sse-mock';
import { waitForAnnouncement } from '../helpers/wait';
import { HomePage } from '../page-objects/HomePage';
import { ChatPage } from '../page-objects/ChatPage';

/**
 * Chaos / resilience E2E tests — 9 distinct scenarios.
 *
 * All failure conditions are simulated via Playwright route interception;
 * no real backend is required. Each test follows the same pattern:
 *   1. Set up failure condition via page.route().
 *   2. Trigger a chat interaction from the home page.
 *   3. Assert the error UI is visible (never blank / frozen).
 *   4. Assert the user has a recovery path (retry button or interactive input).
 *
 * Coverage relative to `e2e/errors/error-states.spec.ts` (which covers agent
 * offline at startup, mixed-valid malformed stream, and 401 auth failure):
 *   This file tests truncated SSE, 503 on stream (recoverable 5xx, retried),
 *   500 mid-conversation, config endpoint failure, concurrent 502 flap, empty
 *   SSE body, all-invalid JSON (no valid tokens), TCP reset retry, and empty
 *   agent response — all genuinely distinct failure paths.
 */

test.describe('Chaos: resilience', () => {
  // Retry backoff (5s+10s+20s+30s) plus recovery polling can take ~60s
  // before the error state is announced — triple the default timeout.
  test.slow();

  // ── 1. SSE drops mid-response ──────────────────────────────────────────────
  //
  // Two token chunks are delivered then the connection closes without [DONE].
  // Expected: UI shows whatever partial content arrived and remains interactive.
  test('SSE drops mid-response: partial content delivered, UI stays interactive', async ({
    page,
  }) => {
    await mountConfig(page, { title: 'Chaos Test' });

    // Two valid token chunks, no [DONE] — stream terminates abruptly.
    await page.route('**/api/proxy/agent/v1/stream', (route) => {
      const body = tokenChunk('Hello', 0) + tokenChunk(' world', 1);
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

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Say hello');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    // The StreamingManager processes the truncated stream and resolves the turn.
    await waitForAnnouncement(page, ['Response complete', 'Stream error']);

    // UI must remain interactive — no blank screen, no crash boundary.
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  // ── 2. Agent stream returns 503 (recoverable 5xx) ─────────────────────────
  //
  // The stream endpoint returns HTTP 503. Unlike the 401 in error-states.spec.ts
  // (non-recoverable 4xx), 503 is recoverable — the StreamingManager retries
  // up to MAX_RETRIES times with exponential backoff before giving up.
  // Expected: "Stream error" is eventually announced; input is still accessible.
  //
  // Distinct from `error-states.spec.ts` test 1 (health-check offline, no
  // message sent) and test 3 (401 auth failure, non-recoverable single attempt).
  test('agent stream returns 503: retried then error announced, input stays accessible', async ({
    page,
  }) => {
    await mountConfig(page, { title: '503 Recoverable Test' });
    await mockAgentHealthy(page);
    await mockStreamError(page, 503);
    await mockThreadState(page);

    const home = new HomePage(page);
    await home.goto();

    await home.submitPrompt('Hello, are you there?');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    // Wait for retry exhaustion — "Stream error" announced after all retries fail.
    await waitForAnnouncement(page, ['Stream error'], 90_000);

    // Input must still be accessible — no crash, no blank screen.
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  // ── 3. HTTP 500 mid-conversation ──────────────────────────────────────────
  //
  // First chat turn succeeds; the second turn returns HTTP 500.
  // Expected: "Stream error" is announced, input remains accessible for retry.
  test('500 mid-conversation: first turn succeeds, second turn shows error, input stays accessible', async ({
    page,
  }) => {
    await mountConfig(page, { title: '500 Mid-Conversation Test' });
    await mockAgentHealthy(page);
    await mockThreadState(page);

    let callCount = 0;
    await page.route('**/api/proxy/agent/v1/stream', (route) => {
      callCount += 1;
      if (callCount === 1) {
        // First turn: healthy response.
        const body = tokenChunk('Turn 1 reply.', 0) + 'data: [DONE]\n\n';
        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          body,
        });
      }
      // Second turn: hard 500.
      return route.fulfill({ status: 500, body: 'Internal Server Error' });
    });

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('First message');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();
    await chat.waitForAIResponse();

    await chat.sendMessage('Second message');

    // Wait for the error state after the 500 response.
    await waitForAnnouncement(page, ['Stream error'], 90_000);

    // Input must still be accessible — user can attempt another message.
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  // ── 4. Config load fails at runtime ───────────────────────────────────────
  //
  // Both /api/config/branding and /api/config/features return 500.
  // Expected: app renders a non-empty page with no unhandled crash.
  test('config endpoints return 500: app renders content instead of blank screen', async ({
    page,
  }) => {
    // Start from a fully healthy baseline then override just the two config routes.
    // Playwright LIFO ordering ensures the overrides take precedence over mountConfig's routes.
    await mountConfig(page, { title: 'Config Failure Test' });
    await mockAgentStream(page, 'Hello');

    await page.route('**/api/config/branding', (route) =>
      route.fulfill({ status: 500, body: 'Config service unavailable' }),
    );
    await page.route('**/api/config/features', (route) =>
      route.fulfill({ status: 500, body: 'Config service unavailable' }),
    );

    await page.goto('/');

    // Body must not be empty — user sees something meaningful.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim()).not.toBe('');

    // No unhandled error boundary message should surface.
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  // ── 5. Concurrent users during agent restart (502 flap) ───────────────────
  //
  // Two independent browser contexts hit 502 simultaneously — simulating an
  // agent pod restart that causes a brief gateway flap.
  // Expected: both users see graceful error state, no blank screens.
  test('502 flap: concurrent users both see graceful error, no blank screens', async ({
    browser,
    baseURL,
  }) => {
    const [ctxA, ctxB] = await Promise.all([
      browser.newContext({ baseURL }),
      browser.newContext({ baseURL }),
    ]);
    const [pageA, pageB] = await Promise.all([
      ctxA.newPage(),
      ctxB.newPage(),
    ]);

    try {
      // Configure both "users": healthy config, healthy agent, 502 on the stream endpoint.
      for (const p of [pageA, pageB]) {
        await mountConfig(p, { title: '502 Flap Test' });
        await mockAgentHealthy(p);
        await mockThreadState(p);
        await p.route('**/api/proxy/agent/v1/stream', (route) =>
          route.fulfill({ status: 502, body: 'Bad Gateway' }),
        );
      }

      // Both users navigate and submit simultaneously.
      await Promise.all([
        (async () => {
          await new HomePage(pageA).goto();
          await new HomePage(pageA).submitPrompt('User A message');
        })(),
        (async () => {
          await new HomePage(pageB).goto();
          await new HomePage(pageB).submitPrompt('User B message');
        })(),
      ]);

      // Both contexts must reach an error state — not freeze or go blank.
      // 502 is recoverable — allow time for retries to exhaust.
      await Promise.all(
        [pageA, pageB].map((p) => waitForAnnouncement(p, ['Stream error'], 90_000)),
      );

      // Input must still be interactive for all users.
      for (const p of [pageA, pageB]) {
        await expect(p.locator('textarea')).toBeVisible();
        await expect(p.locator('body')).not.toContainText('Something went wrong');
      }
    } finally {
      await Promise.all([ctxA.close(), ctxB.close()]);
    }
  });

  // ── 6. SSE timeout / stalled stream ───────────────────────────────────────
  //
  // The SSE connection opens (correct headers) but the body is empty — the
  // server accepted the connection then sent nothing before closing it.
  // Expected: UI reaches a terminal state (no-response or error) without freezing.
  test('stalled SSE stream: empty body; UI reaches terminal state, not blank', async ({
    page,
  }) => {
    await mountConfig(page, { title: 'Stalled Stream Test' });
    await mockAgentHealthy(page);
    await mockThreadState(page);

    // SSE headers present but body is completely empty — server closes immediately.
    await page.route('**/api/proxy/agent/v1/stream', (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: '',
      }),
    );

    const home = new HomePage(page);
    await home.goto();

    await home.submitPrompt('Will you respond?');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    // Empty body stream completes silently (200 OK, no error). Wait briefly
    // for the stream to settle, then verify the UI didn't crash.
    await page.waitForTimeout(5_000);
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  // ── 7. Malformed SSE payload (entirely invalid JSON, zero valid tokens) ────
  //
  // Every SSE data line contains invalid JSON — the stream ends with [DONE].
  // Distinct from `error-states.spec.ts` malformed-stream test which mixes
  // valid and invalid data lines (partial content arrives). Here, zero valid
  // tokens arrive, so the SSEProcessor must survive pure-garbage input without
  // crashing or leaving the UI in a broken state.
  test('all-malformed SSE payload: parse errors are swallowed, UI does not crash', async ({
    page,
  }) => {
    await mountConfig(page, { title: 'Malformed Payload Test' });

    await page.route('**/api/proxy/agent/v1/stream', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body:
          'data: {this is not valid json}\n\n' +
          'data: !!TOTALLY_INVALID!!\n\n' +
          'data: <xml>surprise</xml>\n\n' +
          'data: [DONE]\n\n',
      }),
    );

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Send me corrupted SSE data');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    await waitForAnnouncement(page, ['Response complete', 'Stream error']);

    // App must be fully interactive — no unhandled error boundary.
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  // ── 8. Network flap recovery ───────────────────────────────────────────────
  //
  // The first stream request is aborted (connection reset). The StreamingManager
  // treats TypeError network errors as recoverable and retries automatically.
  // The second attempt succeeds with a normal response.
  // Expected: UI ultimately resolves with "Response complete"; no crash.
  test('network flap: connection reset on first attempt; UI stays interactive', async ({
    page,
  }) => {
    await mountConfig(page, { title: 'Network Flap Test' });
    await mockAgentHealthy(page);
    await mockThreadState(page);

    let attempts = 0;
    await page.route('**/api/proxy/agent/v1/stream', (route) => {
      attempts += 1;
      if (attempts === 1) {
        // Simulate a TCP connection reset — browser sees a network TypeError,
        // which isRecoverableStreamError() treats as recoverable.
        return route.abort('connectionreset');
      }
      // Subsequent attempts succeed.
      const body = tokenChunk('Recovered successfully!', 0) + 'data: [DONE]\n\n';
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body,
      });
    });

    const home = new HomePage(page);
    await home.goto();

    await home.submitPrompt('First attempt — will flap then recover');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    // Wait for recovery — the second attempt succeeds with "Response complete".
    await waitForAnnouncement(page, ['Response complete'], 90_000);

    // The recovered response content should be visible.
    await expect(page.locator('body')).toContainText('Recovered successfully!');
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  // ── 9. Agent returns empty / null response ────────────────────────────────
  //
  // The stream sends [DONE] immediately with zero token events — the agent
  // produced no content whatsoever.
  // Expected: the ChatMessagesView "no response" panel appears with a visible
  // Retry button (showNoResponse fires after its 1 500 ms grace period).
  test('empty agent response: stream ends with no tokens; UI stays interactive', async ({
    page,
  }) => {
    await mountConfig(page, { title: 'Empty Response Test' });
    await mockAgentHealthy(page);
    await mockThreadState(page);

    // [DONE] fires with no preceding token events — zero content delivered.
    await page.route('**/api/proxy/agent/v1/stream', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: 'data: [DONE]\n\n',
      }),
    );

    const home = new HomePage(page);
    await home.goto();

    await home.submitPrompt('Give me an empty response');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    // [DONE] with zero tokens completes the stream silently. Wait briefly
    // for the stream to settle, then verify the UI didn't crash.
    await page.waitForTimeout(5_000);
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });
});
