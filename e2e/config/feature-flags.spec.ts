import { test, expect } from '@playwright/test';
import { mountConfig } from '../helpers/config-mount';
import { mockAgentStream } from '../helpers/sse-mock';
import { HomePage } from '../page-objects/HomePage';

/**
 * Feature-flag config tests.
 *
 * The /api/config/features endpoint drives the DebugToggle initial state.
 * When debug_mode_default=false the toggle shows "Enable debug mode";
 * when debug_mode_default=true the toggle shows "Disable debug mode"
 * (because the flag pre-sets debugMode in the Redux userSettings slice).
 *
 * The DebugToggle is rendered in the AppLayout header and is therefore
 * visible on every page once the app mounts.
 */
test.describe('Config: feature flags', () => {
  test('debug_mode_default=false: debug toggle shows "Enable debug mode" aria-label', async ({
    page,
  }) => {
    await mountConfig(page, { title: 'Debug Off Test' }, { debug_mode_default: false });
    await mockAgentStream(page, 'Hello');
    const home = new HomePage(page);
    await home.goto();

    await expect(
      page.getByRole('button', { name: /enable debug mode/i }),
    ).toBeVisible();
  });

  test('debug_mode_default=true: debug toggle shows "Disable debug mode" aria-label', async ({
    page,
  }) => {
    await mountConfig(page, { title: 'Debug On Test' }, { debug_mode_default: true });
    await mockAgentStream(page, 'Hello');
    const home = new HomePage(page);
    await home.goto();

    await expect(
      page.getByRole('button', { name: /disable debug mode/i }),
    ).toBeVisible();
  });
});
