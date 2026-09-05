/**
 * WCAG 2.1 AA E2E accessibility tests using axe-core/playwright.
 *
 * Unlike the jest-axe unit tests, these run in a real Chromium browser so
 * color-contrast and other rules that need computed styles are fully checked.
 *
 * Covers:
 *  - Home page (light + dark)
 *  - Chat page after a streamed response
 *  - Settings page — all 6 tab panels
 */
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mountConfig } from '../helpers/config-mount';
import { mockAgentStream } from '../helpers/sse-mock';
import { HomePage } from '../page-objects/HomePage';
import { ChatPage } from '../page-objects/ChatPage';
import { SettingsPage } from '../page-objects/SettingsPage';

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runAxe(page: import('@playwright/test').Page) {
  const results = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    // Exclude content that is explicitly hidden from the accessibility tree.
    // aria-hidden elements are not exposed to AT users; colour-contrast rules
    // are still enforced on all other visible content.
    .exclude('[aria-hidden="true"]')
    .analyze();
  return results.violations;
}

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

test.describe('Home page — WCAG 2.1 AA', () => {
  test.beforeEach(async ({ page }) => {
    await mountConfig(page);
  });

  test('light mode has no violations', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    // Force light theme class
    await page.addInitScript(() => {
      localStorage.setItem('template-ui-settings', JSON.stringify({ theme: 'light' }));
    });
    await page.goto('/');
    await page.waitForSelector('textarea', { state: 'visible' });
    const violations = await runAxe(page);
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });

  test('dark mode has no violations', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => {
      localStorage.setItem('template-ui-settings', JSON.stringify({ theme: 'dark' }));
    });
    await page.goto('/');
    await page.waitForSelector('textarea', { state: 'visible' });
    const violations = await runAxe(page);
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Chat page
// ---------------------------------------------------------------------------

test.describe('Chat page — WCAG 2.1 AA', () => {
  test.beforeEach(async ({ page }) => {
    await mountConfig(page);
    await mockAgentStream(page, 'Hello! I can help with data analysis and queries.');
  });

  test('light mode — after AI response has no violations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      localStorage.setItem('template-ui-settings', JSON.stringify({ theme: 'light' }));
    });
    const home = new HomePage(page);
    const chat = new ChatPage(page);

    await home.goto();
    await home.submitPrompt('What can you do?');
    await chat.waitForAIResponse();

    const violations = await runAxe(page);
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });

  test('dark mode — after AI response has no violations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.addInitScript(() => {
      localStorage.setItem('template-ui-settings', JSON.stringify({ theme: 'dark' }));
    });
    const home = new HomePage(page);
    const chat = new ChatPage(page);

    await home.goto();
    await home.submitPrompt('What can you do?');
    await chat.waitForAIResponse();

    const violations = await runAxe(page);
    expect(violations, formatViolations(violations)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Settings page — each tab panel must be tested individually since only the
// active panel is in the visible DOM at a time.
// ---------------------------------------------------------------------------

const SETTINGS_TABS = ['Profile', 'Your Memories', 'User Rules', 'Appearance', 'Tool Approvals', 'MCP OAuth'] as const;

test.describe('Settings page — WCAG 2.1 AA', () => {
  test.beforeEach(async ({ page }) => {
    await mountConfig(page);
  });

  for (const tab of SETTINGS_TABS) {
    test(`light mode — ${tab} tab has no violations`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('template-ui-settings', JSON.stringify({ theme: 'light' }));
      });
      const settings = new SettingsPage(page);
      await settings.goto();
      await settings.selectTab(tab);
      await page.waitForTimeout(150); // let panel paint

      const violations = await runAxe(page);
      expect(violations, formatViolations(violations)).toHaveLength(0);
    });

    test(`dark mode — ${tab} tab has no violations`, async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('template-ui-settings', JSON.stringify({ theme: 'dark' }));
      });
      const settings = new SettingsPage(page);
      await settings.goto();
      await settings.selectTab(tab);
      await page.waitForTimeout(150);

      const violations = await runAxe(page);
      expect(violations, formatViolations(violations)).toHaveLength(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Utility: format axe violations for readable test failure messages
// ---------------------------------------------------------------------------

function formatViolations(violations: import('axe-core').Result[]): string {
  if (violations.length === 0) return '';
  return (
    `\n\n${violations.length} axe violation(s):\n` +
    violations
      .map(
        (v, i) =>
          `  ${i + 1}. [${v.impact}] ${v.id}: ${v.description}\n` +
          v.nodes
            .slice(0, 2)
            .map((n) => `     → ${n.html.slice(0, 120)}`)
            .join('\n'),
      )
      .join('\n\n')
  );
}
