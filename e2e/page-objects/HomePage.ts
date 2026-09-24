import type { Page } from '@playwright/test';

/** Page object for the homepage (`/`). */
export class HomePage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/');
    await this.page.waitForSelector('textarea', { state: 'visible' });
  }

  /** Returns the browser document title set from the branding config. */
  async getDocumentTitle(): Promise<string> {
    return this.page.title();
  }

  /** Fills the chat input and clicks the submit button. */
  async submitPrompt(text: string): Promise<void> {
    await this.page.locator('textarea').fill(text);
    await this.page.locator('button[type="submit"]').click();
  }

  /** Clicks a quick-prompt chip button that contains the given text. */
  async clickQuickPrompt(text: string): Promise<void> {
    await this.page.getByText(text, { exact: false }).first().click();
  }
}
