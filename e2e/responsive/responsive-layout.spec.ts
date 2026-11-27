import { test, expect, type Page } from '@playwright/test';
import { mountConfig } from '../helpers/config-mount';
import { mockAgentStream } from '../helpers/sse-mock';
import { HomePage } from '../page-objects/HomePage';
import { ChatPage } from '../page-objects/ChatPage';

// Set SHOT_DIR to also write screenshots (manual visual review); unset in CI.
const SHOT_DIR = process.env.SHOT_DIR;

async function shot(page: Page, name: string) {
  if (SHOT_DIR) await page.screenshot({ path: `${SHOT_DIR}/${name}.png` });
}

async function seedTheme(page: Page, mode: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme: mode });
  await page.addInitScript((m) => localStorage.setItem('template-ui-theme', m), mode);
}

const isTransparent = (c: string) => c === 'transparent' || /rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(c);

for (const mode of ['light', 'dark'] as const) {
  test.describe(`responsive shell (${mode})`, () => {
    test.beforeEach(async ({ page }) => {
      await seedTheme(page, mode);
      await mountConfig(page, { title: 'Test Agent' });
      await mockAgentStream(page, 'Hello from the test agent!');
    });

    test('768px: sidebar is a closed, opaque overlay that closes on outside click', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 900 });
      await new HomePage(page).goto();
      const sidebar = page.locator('#app-sidebar');
      await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
      await shot(page, `taskR-welcome-768-${mode}`);

      await page.getByRole('button', { name: 'Toggle navigation' }).click();
      await expect(sidebar).toHaveAttribute('aria-hidden', 'false');
      const bg = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(isTransparent(bg)).toBe(false);
      await expect(page.getByRole('button', { name: 'New Chat' })).toBeFocused();
      if (SHOT_DIR) await page.waitForTimeout(500); // let PF's slide-in finish
      await shot(page, `taskR-sidebar-open-768-${mode}`);

      await page.mouse.click(700, 500);
      await expect(sidebar).toHaveAttribute('aria-hidden', 'true');
      await expect(page.getByRole('button', { name: 'Toggle navigation' })).toBeFocused();
    });

    test('768px: Escape closes the overlay', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 900 });
      await new HomePage(page).goto();
      await page.getByRole('button', { name: 'Toggle navigation' }).click();
      await page.keyboard.press('Escape');
      await expect(page.locator('#app-sidebar')).toHaveAttribute('aria-hidden', 'true');
    });

    test('1440px: sidebar stays inline and transparent', async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await new HomePage(page).goto();
      const sidebar = page.locator('#app-sidebar');
      await expect(sidebar).toHaveAttribute('aria-hidden', 'false');
      const bg = await sidebar.evaluate((el) => getComputedStyle(el).backgroundColor);
      expect(isTransparent(bg)).toBe(true);
      await shot(page, `taskR-welcome-1440-${mode}`);
    });

    for (const width of [1440, 1024, 375]) {
      test(`${width}px: welcome, thread and settings have no horizontal overflow`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        const home = new HomePage(page);
        await home.goto();
        const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
        expect(await overflow()).toBe(false);
        await shot(page, `taskR-welcome-${width}-${mode}`);

        await home.submitPrompt('Tell me something interesting.');
        await new ChatPage(page).waitForAIResponse();
        expect(await overflow()).toBe(false);
        await shot(page, `taskR-thread-${width}-${mode}`);

        await page.goto('/settings');
        await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
        expect(await overflow()).toBe(false);
        await shot(page, `taskR-settings-${width}-${mode}`);
      });
    }

    test('768px: settings uses horizontal tabs; thread + settings screenshots', async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 900 });
      const home = new HomePage(page);
      await home.goto();
      await home.submitPrompt('Tell me something interesting.');
      await new ChatPage(page).waitForAIResponse();
      await shot(page, `taskR-thread-768-${mode}`);
      await page.goto('/settings');
      await expect(page.getByRole('tablist')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Settings sections' })).toHaveCount(0);
      await shot(page, `taskR-settings-768-${mode}`);
    });
  });
}
