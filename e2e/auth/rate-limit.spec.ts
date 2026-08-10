import { test, expect } from '@playwright/test';
import { mountConfig } from '../helpers/config-mount';
import { mockRateLimitResponse } from '../helpers/sse-mock';
import { HomePage } from '../page-objects/HomePage';
import { ChatPage } from '../page-objects/ChatPage';

/**
 * Rate-limit (429) tests:
 *
 *  1. When the stream endpoint returns 429, the input form shows a
 *     "Rate limited. Try again in Xs" alert and the submit button is disabled.
 *  2. The countdown text updates while the rate limit is active.
 */

test.describe('Rate limit — 429 handling', () => {
  test.beforeEach(async ({ page }) => {
    await mountConfig(page, { title: 'Rate Limit Test' });
  });

  // ── Banner appears ─────────────────────────────────────────────────────────

  test('shows a rate-limit alert when the stream returns 429', async ({ page }) => {
    await mockRateLimitResponse(page, 30);

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Send a message');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    // The InputForm renders <Alert title="Rate limited. Try again in Xs" />
    // Match the PatternFly alert heading (not user-message / page titles).
    await expect(
      page.getByRole('heading', { name: /warning alert: rate limited/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  // ── Submit button is disabled ──────────────────────────────────────────────

  test('the cancel button is shown (submit blocked) while rate-limited', async ({ page }) => {
    await mockRateLimitResponse(page, 30);

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Hello from rate limit test');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();
    await expect(
      page.getByRole('heading', { name: /warning alert: rate limited/i }),
    ).toBeVisible({ timeout: 15_000 });

    // During the retry backoff the stream is still active (cancel button visible),
    // which means the submit button is NOT rendered and new messages cannot be sent.
    await expect(page.getByRole('button', { name: /cancel streaming/i })).toBeVisible();
  });

  // ── Retry-After respected ──────────────────────────────────────────────────

  test('shows the Retry-After seconds in the alert text', async ({ page }) => {
    await mockRateLimitResponse(page, 10);

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Rate limited request');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    // The alert heading "Rate limited. Try again in Xs" should mention the countdown
    await expect(page.getByRole('heading', { name: /try again in \d+s/i })).toBeVisible({ timeout: 15_000 });
  });

  // ── Normal flow unaffected ─────────────────────────────────────────────────

  test('does NOT show a rate-limit alert on a normal 200 response', async ({ page }) => {
    // Override the rate-limit mock with a normal response
    await page.route('**/api/proxy/agent/v1/stream', (route) => {
      const body = `data: ${JSON.stringify({ type: 'token', content: 'OK', chunk_id: 0 })}\n\ndata: [DONE]\n\n`;
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body,
      });
    });

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Normal request');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();
    await chat.waitForAIResponse(15_000);

    await expect(
      page.getByRole('heading', { name: /warning alert: rate limited/i }),
    ).not.toBeVisible();
  });
});
