import { test, expect } from '@playwright/test';
import { mountConfig } from '../helpers/config-mount';
import { SettingsPage } from '../page-objects/SettingsPage';
import { setLocalStorageSettings, getLocalStorageSettings } from '../helpers/local-storage';

/**
 * Settings page tests:
 *
 *  1. Settings page loads with the expected heading.
 *  2. All tabs are navigable.
 *  3. Theme toggle persists to localStorage.
 *  4. "Tool Approvals" tab shows always-allowed tools list.
 *  5. Adding a tool to always-allowed saves to localStorage.
 */

test.describe('Settings page', () => {
  test.beforeEach(async ({ page }) => {
    await mountConfig(page, { title: 'Settings Test' });
  });

  // ── Basic load ─────────────────────────────────────────────────────────────

  test('settings page loads with the Settings heading', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    const heading = await settings.getHeading();
    expect(heading.toLowerCase()).toContain('settings');
  });

  test('settings page can be reached via the /settings route', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  });

  // ── Tab navigation ─────────────────────────────────────────────────────────

  test('Profile tab is visible and active by default', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.expectTabContentVisible('Profile');
  });

  test('clicking Appearance tab shows the Appearance section', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.clickTab('Appearance');
    await settings.expectTabContentVisible('Appearance');
  });

  test('clicking Tool Approvals tab shows the tool list', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.clickTab('Tool Approvals');
    await settings.expectTabContentVisible('Tool Approvals');
  });

  test('clicking Memories tab shows the Memories section', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.clickTab('Your Memories');
    await settings.expectTabContentVisible('Your Memories');
  });

  test('clicking MCP OAuth tab shows the OAuth connections section', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.clickTab('MCP OAuth');
    await settings.expectTabContentVisible('MCP OAuth');
    await expect(page.getByText(/no oauth-connected services are configured/i)).toBeVisible();
  });

  // ── Theme toggle + localStorage persistence ────────────────────────────────

  test('toggling the theme persists the selection to localStorage', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.clickTab('Appearance');

    // Toggle to "Dark" theme
    const darkOption = page.getByRole('radio', { name: /dark/i });
    await darkOption.click();

    const stored = await getLocalStorageSettings(page);
    expect(stored?.theme).toBe('dark');

    // Toggle back to "Light"
    const lightOption = page.getByRole('radio', { name: /light/i });
    await lightOption.click();

    const stored2 = await getLocalStorageSettings(page);
    expect(stored2?.theme).toBe('light');
  });

  // ── Pre-populated settings from localStorage ───────────────────────────────

  test('pre-populated alwaysAllowedTools from localStorage are shown in Tool Approvals', async ({
    page,
  }) => {
    await setLocalStorageSettings(page, { alwaysAllowedTools: ['web_search', 'github_search'] });
    await mountConfig(page, { title: 'Tool Approvals Test' });

    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.clickTab('Tool Approvals');

    await expect(page.getByText('web_search')).toBeVisible();
    await expect(page.getByText('github_search')).toBeVisible();
  });

  // ── Back navigation ────────────────────────────────────────────────────────

  test('back button navigates to the home page', async ({ page }) => {
    const settings = new SettingsPage(page);
    await settings.goto();
    await settings.navigateBack();
    await expect(page).toHaveURL('/');
  });
});
