import { test, expect } from '@playwright/test';
import { mountConfig, mountMinimalConfig, mountFullConfig } from '../helpers/config-mount';
import { mockAgentStream } from '../helpers/sse-mock';
import { HomePage } from '../page-objects/HomePage';

/**
 * Branding config tests.
 *
 * Two config scenarios are exercised:
 *   - Minimal config: only required fields (title, default colours, no logo).
 *   - Full config: all optional fields populated (logo_url, favicon_url, custom colours).
 *
 * Tests assert that the Fastify server's /api/config/branding response is
 * correctly consumed by the React app to update document title, logo element,
 * and CSS custom properties.
 */
test.describe('Config: branding', () => {
  // ── Minimal config scenario ───────────────────────────────────────────────

  test('minimal config: document title reflects branding title', async ({ page }) => {
    await mountMinimalConfig(page);
    await mockAgentStream(page, 'Hello');
    const home = new HomePage(page);
    await home.goto();
    expect(await home.getDocumentTitle()).toBe('Minimal Agent');
  });

  test('minimal config: no logo image is rendered when logo_url is empty', async ({ page }) => {
    await mountMinimalConfig(page);
    await mockAgentStream(page, 'Hello');
    const home = new HomePage(page);
    await home.goto();
    // logo_url is '' so no <img> with a branding src should appear in the header
    const logoImg = page.locator('img[alt="Logo"], img[alt="Minimal Agent"]');
    await expect(logoImg).toHaveCount(0);
  });

  // ── Full config scenario ──────────────────────────────────────────────────

  test('full config: document title reflects full branding title', async ({ page }) => {
    await mountFullConfig(page);
    await mockAgentStream(page, 'Hello');
    const home = new HomePage(page);
    await home.goto();
    expect(await home.getDocumentTitle()).toBe('Full Config Agent');
  });

  test('full config: logo image element is visible with correct src', async ({ page }) => {
    await mountFullConfig(page);
    await mockAgentStream(page, 'Hello');
    const home = new HomePage(page);
    await home.goto();
    // AppLayout renders <img src={branding.logo_url} alt={branding.title || 'Logo'} />
    const logo = page.locator('img[alt="Full Config Agent"], img[alt="Logo"]').first();
    await expect(logo).toBeVisible();
    const src = await logo.getAttribute('src');
    expect(src).toContain('redhat-logo');
  });

  test('full config: CSS custom property --primary is applied from branding colours', async ({
    page,
  }) => {
    const customPrimary = '#abcdef';
    // Apply the custom colour to both themes so the assertion holds regardless
    // of whether the app initialises in light or dark mode.
    await mountConfig(
      page,
      { title: 'Color Test', colors: { light: { primary: customPrimary }, dark: { primary: customPrimary } } },
    );
    await mockAgentStream(page, 'Hello');
    const home = new HomePage(page);
    await home.goto();

    // Wait for App.tsx's branding useEffect to set the CSS variable
    await page.waitForFunction(() => {
      const val = document.documentElement.style.getPropertyValue('--primary');
      return val !== '';
    });

    const primaryVar = await page.evaluate(() =>
      document.documentElement.style.getPropertyValue('--primary'),
    );
    expect(primaryVar.toLowerCase().replace(/\s+/g, '')).toBe(customPrimary);
  });
});
