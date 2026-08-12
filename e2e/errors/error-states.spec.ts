import { test, expect } from '@playwright/test';
import { mountConfig } from '../helpers/config-mount';
import { mockAgentStream, mockMalformedStream, mockStreamError } from '../helpers/sse-mock';
import { HomePage } from '../page-objects/HomePage';
import { ChatPage } from '../page-objects/ChatPage';

/**
 * Error-path tests covering:
 *   1. Agent unreachable   – /api/health/agent returns non-200; sidebar shows "Agent: offline".
 *   2. Malformed stream    – SSE body contains invalid JSON; UI must not crash.
 *   3. Auth failure        – streaming endpoint returns 401; StreamingManager marks the stream
 *                            as failed (non-recoverable 4xx) and the sr-only aria-live region
 *                            announces "Stream error".
 */
test.describe('Error states', () => {
  // ── Agent unreachable ─────────────────────────────────────────────────────

  test('agent unreachable: sidebar shows "Agent: offline" indicator', async ({ page }) => {
    // Mount base config with agentHealth='unhealthy' so the health endpoint
    // returns 503 / { status: 'unhealthy' } from the first poll onwards.
    await mountConfig(page, { title: 'Offline Agent Test' }, {}, 'unhealthy');
    await mockAgentStream(page, 'Hello');

    const home = new HomePage(page);
    await home.goto();

    // useAgentHealth polls immediately on mount; the sidebar indicator updates
    // as soon as the first health check completes.
    await expect(page.getByText('Agent: offline')).toBeVisible({ timeout: 15_000 });
  });

  // ── Malformed stream ──────────────────────────────────────────────────────

  test('malformed stream: UI does not crash when receiving invalid SSE data', async ({ page }) => {
    await mountConfig(page);
    await mockMalformedStream(page);

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Test malformed stream handling');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    // The mock SSE body ends with `data: [DONE]\n\n` so the StreamingManager calls
    // onDone(), which triggers the "Response complete" / "Stream error" announcement.
    // Wait for that live-region update rather than using an arbitrary sleep.
    await page.waitForFunction(
      () => {
        const liveRegion = document.querySelector('.sr-only[aria-live="polite"]');
        const text = liveRegion?.textContent ?? '';
        return text.includes('Response complete') || text.includes('Stream error');
      },
      { timeout: 15_000 },
    );

    // The app must still be interactive — no top-level error boundary message
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Something went wrong');
  });

  // ── Auth failure ──────────────────────────────────────────────────────────

  test('auth failure on stream: aria-live region announces "Stream error"', async ({ page }) => {
    await mountConfig(page);
    // 401 from the streaming endpoint is a non-recoverable 4xx; the
    // StreamingManager throws and the ChatPage announces "Stream error"
    // through its sr-only aria-live polite region.
    await mockStreamError(page, 401);

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('This request will be rejected with 401');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    // Wait for the live region to announce the failure
    await page.waitForFunction(
      () => {
        const liveRegion = document.querySelector('.sr-only[aria-live="polite"]');
        return liveRegion?.textContent?.includes('Stream error');
      },
      { timeout: 15_000 },
    );
  });
});
