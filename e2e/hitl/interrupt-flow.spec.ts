import { test, expect } from '@playwright/test';
import { mountConfig } from '../helpers/config-mount';
import { HomePage } from '../page-objects/HomePage';
import { ChatPage } from '../page-objects/ChatPage';

/**
 * Human-In-The-Loop (HITL) interrupt flow tests.
 *
 * The InterruptBanner component is rendered via `interruptContent` in ChatPage
 * for NON-action_requests interrupts (strings and MCP auth).
 * For string interrupt values, isToolApproval() decides which branch:
 *  - Contains "approve" / "confirm" / "allow" etc → "Action Required" (Approve/Reject buttons)
 *  - Otherwise → "Input Required" (text input + Send button)
 */

// String interrupt that triggers the "Action Required" branch (contains "approve")
const TOOL_APPROVAL_STR = 'Do you approve running github_create_pr with title "Test PR"?';

// String interrupt that triggers the "Input Required" branch (no approval keywords)
const GENERIC_INTERRUPT_VALUE = 'What format should the output be in?';

function makeInterruptBody(value: string | object, chunkId = 0): string {
  return (
    `data: ${JSON.stringify({
      type: 'interrupt',
      content: { value, resumable: true },
      chunk_id: chunkId,
    })}\n\n` + 'data: [DONE]\n\n'
  );
}

test.describe('HITL — interrupt banner rendering', () => {
  test.beforeEach(async ({ page }) => {
    await mountConfig(page, { title: 'HITL Test Agent' });
  });

  // ── Tool approval ─────────────────────────────────────────────────────────

  test('renders the interrupt banner for a tool-approval interrupt', async ({ page }) => {
    await page.route('**/api/proxy/agent/v1/stream', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: makeInterruptBody(TOOL_APPROVAL_STR),
      }),
    );

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Create a pull request');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    await expect(page.getByText('Action Required')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /approve/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /reject/i })).toBeVisible();
  });

  test('clicking Approve sends a resume stream request and removes the banner', async ({
    page,
  }) => {
    let callCount = 0;
    await page.route('**/api/proxy/agent/v1/stream', (route) => {
      callCount++;
      if (callCount === 1) {
        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          body: makeInterruptBody(TOOL_APPROVAL_STR),
        });
      }
      const body = `data: ${JSON.stringify({ type: 'token', content: 'PR created!', chunk_id: 0 })}\n\ndata: [DONE]\n\n`;
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body,
      });
    });

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Create a pull request');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();
    await expect(page.getByText('Action Required')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /approve/i }).click();

    // Banner should disappear once resume is sent
    await expect(page.getByText('Action Required')).not.toBeVisible({ timeout: 10_000 });
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  test('clicking Reject sends a reject resume and removes the banner', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/proxy/agent/v1/stream', (route) => {
      callCount++;
      if (callCount === 1) {
        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          body: makeInterruptBody(TOOL_APPROVAL_STR),
        });
      }
      const body = `data: ${JSON.stringify({ type: 'token', content: 'Skipped.', chunk_id: 0 })}\n\ndata: [DONE]\n\n`;
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body,
      });
    });

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Create a pull request');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();
    await expect(page.getByText('Action Required')).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: /reject/i }).click();
    await expect(page.getByText('Action Required')).not.toBeVisible({ timeout: 10_000 });
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  // ── Generic text interrupt ──────────────────────────────────────────────

  test('renders "Input Required" for a generic text interrupt', async ({ page }) => {
    await page.route('**/api/proxy/agent/v1/stream', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: makeInterruptBody(GENERIC_INTERRUPT_VALUE),
      }),
    );

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Run the analysis');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();

    await expect(page.getByText('Input Required')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('textbox', { name: /interrupt response/i })).toBeVisible();
    // Use exact name to avoid matching the chat's "Send message" submit button
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible();
  });

  test('Send button submits the typed text as the resume response', async ({ page }) => {
    let callCount = 0;
    await page.route('**/api/proxy/agent/v1/stream', (route) => {
      callCount++;
      if (callCount === 1) {
        return route.fulfill({
          status: 200,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          body: makeInterruptBody(GENERIC_INTERRUPT_VALUE),
        });
      }
      const body = `data: ${JSON.stringify({ type: 'token', content: 'Got it.', chunk_id: 0 })}\n\ndata: [DONE]\n\n`;
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body,
      });
    });

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('Run the analysis');

    const chat = new ChatPage(page);
    await chat.expectChatRoute();
    await expect(page.getByText('Input Required')).toBeVisible({ timeout: 15_000 });

    const input = page.getByRole('textbox', { name: /interrupt response/i });
    await input.fill('JSON format please');
    await page.getByRole('button', { name: 'Send', exact: true }).click();

    // Banner gone, second stream call made
    await expect(page.getByText('Input Required')).not.toBeVisible({ timeout: 10_000 });
    expect(callCount).toBeGreaterThanOrEqual(2);
  });
});
