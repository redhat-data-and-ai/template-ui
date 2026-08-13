import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/** Page object for the chat view (`/chat/:threadId`). */
export class ChatPage {
  constructor(private readonly page: Page) {}

  async waitForLoad(): Promise<void> {
    // The chat input becomes visible once the page has mounted
    await this.page.waitForSelector('textarea', { state: 'visible', timeout: 10_000 });
  }

  /**
   * Wait for the streaming loading indicator to disappear and for at least
   * one AI message bubble to appear in the DOM.
   */
  async waitForAIResponse(timeout = 15_000): Promise<void> {
    // The sr-only aria-live region in ChatPage.tsx announces "Response complete".
    // Use the .sr-only qualifier to avoid matching the chat messages live-log element.
    await this.page.waitForFunction(
      () => {
        const liveRegion = document.querySelector('.sr-only[aria-live="polite"]');
        return liveRegion?.textContent?.includes('Response complete');
      },
      { timeout },
    );
  }

  /** Returns true when the current URL matches a chat route. */
  async isOnChatRoute(): Promise<boolean> {
    return /\/chat\//.test(this.page.url());
  }

  /** Asserts the current URL contains a chat thread segment. */
  async expectChatRoute(): Promise<void> {
    await expect(this.page).toHaveURL(/\/chat\//);
  }

  /** Fills the chat input on the chat page and clicks submit — mirrors HomePage.submitPrompt. */
  async sendMessage(text: string): Promise<void> {
    await this.page.locator('textarea').fill(text);
    await this.page.locator('button[type="submit"]').click();
  }

  /** Returns the full visible text content of the page — useful for asserting response text. */
  async getBodyText(): Promise<string> {
    return this.page.locator('body').innerText();
  }
}
