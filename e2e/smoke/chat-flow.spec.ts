import { test, expect } from '@playwright/test';
import { HomePage } from '../page-objects/HomePage';
import { ChatPage } from '../page-objects/ChatPage';
import { mountConfig } from '../helpers/config-mount';
import { mockAgentStream } from '../helpers/sse-mock';

const MOCK_RESPONSE = 'Hello from the test agent!';

test.describe('Chat flow smoke test', () => {
  test.beforeEach(async ({ page }) => {
    await mountConfig(page, { title: 'Test Agent' });
    await mockAgentStream(page, MOCK_RESPONSE);
  });

  test('home page loads with textarea and submit button', async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('submitting a prompt navigates to the chat route', async ({ page }) => {
    const home = new HomePage(page);
    const chat = new ChatPage(page);

    await home.goto();
    await home.submitPrompt('What can you do?');

    await chat.expectChatRoute();
  });

  test('chat page shows AI response after streaming completes', async ({ page }) => {
    const home = new HomePage(page);
    const chat = new ChatPage(page);

    await home.goto();
    await home.submitPrompt('Tell me something interesting.');

    await chat.expectChatRoute();
    await chat.waitForAIResponse();

    const bodyText = await chat.getBodyText();
    expect(bodyText).toContain(MOCK_RESPONSE);
  });
});
