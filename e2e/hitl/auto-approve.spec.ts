import { test, expect } from '@playwright/test';
import { mountConfig } from '../helpers/config-mount';
import { setLocalStorageSettings } from '../helpers/local-storage';
import { HomePage } from '../page-objects/HomePage';
import { ChatPage } from '../page-objects/ChatPage';

/**
 * Auto-approve tests:
 *
 *  1. When `alwaysAllowedTools` contains the tool from an action_requests interrupt,
 *     the resume is sent automatically without showing any approval UI.
 *  2. When the tool is NOT in `alwaysAllowedTools` AND the interrupt is a non-actionable
 *     string value, the InterruptBanner appears for the user.
 *  3. When `autoApproveAllTools` is true, every action_requests interrupt is auto-approved.
 */

const TOOL_APPROVAL_INTERRUPT = {
  action_requests: [{ name: 'github_search', args: { query: 'bugs' } }],
  review_configs: [{ action_name: 'github_search', allowed_decisions: ['approve', 'reject'] }],
};

// A string interrupt (not action_requests) that triggers the InterruptBanner's
// "Action Required" branch (contains "approve").  Since it's a string, the
// ChatPage auto-approve useEffect skips it — the banner always appears.
const APPROVAL_STRING_INTERRUPT =
  'Do you approve running the dangerous_tool with the provided arguments?';

const UNKNOWN_TOOL_INTERRUPT = {
  action_requests: [{ name: 'dangerous_tool', args: {} }],
  review_configs: [{ action_name: 'dangerous_tool', allowed_decisions: ['approve', 'reject'] }],
};

async function makeInterruptStream(
  value: object | string,
  callCount: { n: number },
  page: import('@playwright/test').Page,
): Promise<void> {
  await page.route('**/api/proxy/agent/v1/stream', (route) => {
    callCount.n++;
    if (callCount.n === 1) {
      const body =
        `data: ${JSON.stringify({
          type: 'interrupt',
          content: { value, resumable: true },
          chunk_id: 0,
        })}\n\n` + 'data: [DONE]\n\n';
      return route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body,
      });
    }
    const body = `data: ${JSON.stringify({ type: 'token', content: 'Done automatically.', chunk_id: 0 })}\n\ndata: [DONE]\n\n`;
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      body,
    });
  });
}

test.describe('HITL — auto-approve', () => {
  // ── auto-approve via alwaysAllowedTools ──────────────────────────────────

  test(
    'banner is skipped when the interrupted tool is in alwaysAllowedTools',
    async ({ page }) => {
      await setLocalStorageSettings(page, { alwaysAllowedTools: ['github_search'] });
      await mountConfig(page, { title: 'Auto Approve Test' });

      const callCount = { n: 0 };
      await makeInterruptStream(TOOL_APPROVAL_INTERRUPT, callCount, page);

      const home = new HomePage(page);
      await home.goto();
      await home.submitPrompt('Search GitHub issues');

      const chat = new ChatPage(page);
      await chat.expectChatRoute();

      // The response should complete without the interrupt banner ever appearing
      await chat.waitForAIResponse(15_000);
      await expect(page.getByText('Action Required')).not.toBeVisible();
      await expect(page.getByText('Input Required')).not.toBeVisible();
      expect(callCount.n).toBeGreaterThanOrEqual(2);
    },
  );

  // ── banner still shown when interrupt is not auto-approvable ─────────────
  // String interrupts bypass the auto-approve useEffect (which only handles
  // action_requests objects), so the InterruptBanner always renders.

  test(
    'banner is shown when the interrupt is a string value (not auto-approved)',
    async ({ page }) => {
      await setLocalStorageSettings(page, { alwaysAllowedTools: ['github_search'] });
      await mountConfig(page, { title: 'Auto Approve Test' });

      const callCount = { n: 0 };
      await makeInterruptStream(APPROVAL_STRING_INTERRUPT, callCount, page);

      const home = new HomePage(page);
      await home.goto();
      await home.submitPrompt('Run the dangerous tool');

      const chat = new ChatPage(page);
      await chat.expectChatRoute();

      // Banner MUST appear because string interrupts are never auto-approved
      await expect(page.getByText('Action Required')).toBeVisible({ timeout: 15_000 });
    },
  );

  // ── auto-approve all via autoApproveAllTools flag ─────────────────────────

  test(
    'banner is skipped when autoApproveAllTools is true, regardless of tool name',
    async ({ page }) => {
      await setLocalStorageSettings(page, { autoApproveAllTools: true });
      await mountConfig(page, { title: 'Auto Approve All Test' });

      const callCount = { n: 0 };
      await makeInterruptStream(UNKNOWN_TOOL_INTERRUPT, callCount, page);

      const home = new HomePage(page);
      await home.goto();
      await home.submitPrompt('Run all tools');

      const chat = new ChatPage(page);
      await chat.expectChatRoute();

      await chat.waitForAIResponse(15_000);
      await expect(page.getByText('Action Required')).not.toBeVisible();
      expect(callCount.n).toBeGreaterThanOrEqual(2);
    },
  );
});
