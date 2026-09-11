import { test, expect } from '@playwright/test';
import { mountConfig } from '../helpers/config-mount';
import { setLocalStorageSettings } from '../helpers/local-storage';
import { HomePage } from '../page-objects/HomePage';

test.describe('Pre-stream setup gate', () => {
  test('cancel keeps the typed prompt and does not start a chat', async ({ page }) => {
    await mountConfig(page, { title: 'Gate Test' });
    await setLocalStorageSettings(page, { autoApproveAllTools: false });

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('hello from the gate test');

    await expect(page.getByRole('dialog', { name: /connect before chatting/i })).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page).toHaveURL('/');
    await expect(page.locator('textarea')).toHaveValue('hello from the gate test');
  });

  test('continue after enabling auto-approve starts the chat', async ({ page }) => {
    await mountConfig(page, { title: 'Gate Test' });
    await setLocalStorageSettings(page, { autoApproveAllTools: false });
    await page.route('**/api/proxy/agent/v1/stream', (route) =>
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: `data: ${JSON.stringify({ type: 'token', content: 'Hi', chunk_id: 0 })}\n\ndata: [DONE]\n\n`,
      }),
    );

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('hello from the gate test');

    const dialog = page.getByRole('dialog', { name: /connect before chatting/i });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await page.locator('label[for="gate-auto-approve-switch"]').click();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/chat\//);
    await expect(page.getByRole('dialog', { name: /connect before chatting/i })).toHaveCount(0);
  });

  test('disconnected OAuth MCP blocks continue until authenticated', async ({ page }) => {
    await mountConfig(page, { title: 'Gate Test' });
    await page.route('**/api/proxy/agent/mcp/oauth/connections', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          connections: [
            {
              mcp_name: 'jira-mcp',
              auth_mode: 'dcr',
              description: 'Jira',
              connected: false,
            },
          ],
        }),
      }),
    );

    const home = new HomePage(page);
    await home.goto();
    await home.submitPrompt('hello from the gate test');

    const dialog = page.getByRole('dialog', { name: /connect before chatting/i });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeDisabled();
    await expect(page.getByRole('button', { name: /authenticate jira/i })).toBeVisible();
    await expect(page).toHaveURL('/');
  });
});
