import type { Page } from '@playwright/test';

export interface BrandingOverride {
  title?: string;
  logo_url?: string;
}

/**
 * Mock the config and agent-proxy endpoints so tests don't depend on
 * a real agent backend.  Config endpoints could be served by the real
 * Fastify process but overriding them keeps tests hermetic.
 */
export async function mountConfig(page: Page, branding: BrandingOverride = {}): Promise<void> {
  await page.route('**/api/config/branding', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        logo_url: branding.logo_url ?? '',
        title: branding.title ?? 'Test Agent',
        colors: {
          light: { primary: '#0066cc', accent: '#a60000', background: '#ffffff', foreground: '#1a1a1a' },
          dark: { primary: '#4dabf7', accent: '#f56e6e', background: '#0a1628', foreground: '#f0f4f8' },
        },
      }),
    }),
  );

  await page.route('**/api/config/features', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ debug_mode_default: false, auth_enabled: false }),
    }),
  );

  // Feedback endpoint called for previously-hydrated chats
  await page.route('**/api/proxy/agent/threads/*/feedback**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );

  // Announcement banner (optional endpoint — return disabled)
  await page.route('**/api/announcement', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: false }),
    }),
  );

  // Agent health probe — avoids 10 s ECONNREFUSED timeout on every page mount
  await page.route('**/api/health/agent', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'healthy' }),
    }),
  );
}
