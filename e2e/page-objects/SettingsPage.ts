import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

type SettingsTab = 'Profile' | 'Your Memories' | 'User Rules' | 'Appearance' | 'Tool Approvals' | 'MCP OAuth';

/** Page object for the settings view (`/settings`). */
export class SettingsPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/settings');
    await this.page.waitForSelector('h1', { state: 'visible' });
  }

  async getHeading(): Promise<string> {
    return this.page.locator('h1').innerText();
  }

  async clickTab(tab: SettingsTab): Promise<void> {
    await this.page.getByRole('tab', { name: tab, exact: false }).click();
  }

  async selectTab(tab: SettingsTab): Promise<void> {
    await this.clickTab(tab);
    await this.page.waitForSelector('[role="tabpanel"]:not([hidden])', { state: 'visible' });
  }

  async expectTabContentVisible(heading: SettingsTab): Promise<void> {
    await expect(this.page.getByRole('heading', { name: heading, exact: false }).first()).toBeVisible();
  }

  /** Navigate back to the home page via the back arrow button. */
  async navigateBack(): Promise<void> {
    await this.page.getByRole('button', { name: 'Back' }).click();
    await expect(this.page).toHaveURL('/');
  }
}
