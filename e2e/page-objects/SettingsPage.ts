import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

/**
 * Settings is two levels now. MCP, Skills, Subagents, Documents and
 * Prompt sit inside **Components**; Profile and Authorization inside
 * **Account**; memories and rules inside **Personalisation**.
 *
 * Tests name the destination, not the route to it — `clickTab('Tool
 * approvals')` still reads as one action — so a future regrouping
 * changes this map and nothing else.
 */
const TABS: Record<string, { outer: string; inner?: string; heading?: string }> = {
  Profile: { outer: 'Account', heading: 'Profile' },
  Authorization: { outer: 'Account', heading: 'Authorization' },
  'Your memories': { outer: 'Personalisation', heading: 'Your memories' },
  'Custom rules': { outer: 'Personalisation', heading: 'Custom rules' },
  Appearance: { outer: 'Appearance', heading: 'Appearance' },
  MCP: { outer: 'Components', inner: 'MCP', heading: 'MCP servers' },
  'Tool approvals': { outer: 'Components', inner: 'MCP', heading: 'Tool approvals' },
  // No `heading`: these panels are a description plus a list, with
  // the tab itself as the only label. Asserting aria-selected is the
  // honest check — inventing a heading just to be assertable would
  // be the test shaping the UI.
  Skills: { outer: 'Components', inner: 'Skills' },
  Subagents: { outer: 'Components', inner: 'Subagents' },
};

export type SettingsTab = keyof typeof TABS;

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
    const { outer, inner } = TABS[tab] as { outer: string; inner?: string };
    // Both levels expose role="tab". Clicking the outer one first
    // means the inner bar exists by the time it is addressed, so the
    // names cannot collide.
    await this.page.getByRole('tab', { name: outer, exact: true }).click();
    if (inner) {
      await this.page.getByRole('tab', { name: inner, exact: true }).click();
    }
  }

  async selectTab(tab: SettingsTab): Promise<void> {
    await this.clickTab(tab);
    await this.expectTabContentVisible(tab);
  }

  async expectTabContentVisible(tab: SettingsTab): Promise<void> {
    const { outer, inner, heading } = TABS[tab];
    if (heading) {
      await expect(
        this.page.getByRole('heading', { name: heading, exact: false }).first(),
      ).toBeVisible();
      return;
    }
    await expect(
      this.page.getByRole('tab', { name: inner ?? outer, exact: true }),
    ).toHaveAttribute('aria-selected', 'true');
  }

  /** Navigate back to the home page via the back arrow button. */
  async navigateBack(): Promise<void> {
    await this.page.getByRole('button', { name: 'Back' }).click();
    await expect(this.page).toHaveURL('/');
  }
}
