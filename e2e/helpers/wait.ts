import type { Page } from '@playwright/test';

/**
 * Wait for the sr-only aria-live polite region (ChatPage.tsx) to contain at
 * least one of the provided strings. The region announces "Agent is thinking",
 * "Response complete", or "Stream error" as stream state changes.
 */
export async function waitForAnnouncement(
  page: Page,
  texts: string[],
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    (expected: string[]) => {
      const region = document.querySelector('.sr-only[aria-live="polite"]');
      const t = region?.textContent ?? '';
      return expected.some((s) => t.includes(s));
    },
    texts,
    { timeout },
  );
}
