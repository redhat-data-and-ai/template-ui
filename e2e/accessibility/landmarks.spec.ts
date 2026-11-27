/**
 * Landmark, heading-order, skip-link and closed-sidebar regressions found by the a11y audit.
 * These use axe best-practice rules that wcag.spec.ts does not enable.
 */
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mountConfig } from "../helpers/config-mount";

const RULES = [
  "region",
  "heading-order",
  "landmark-one-main",
  "landmark-no-duplicate-main",
  "landmark-main-is-top-level",
  "landmark-unique",
];

async function structural(page: Page) {
  const r = await new AxeBuilder({ page }).withRules(RULES)
    .exclude(".pf-v6-c-alert-group") // transient toasts (e.g. unmocked API errors), not page structure
    .analyze();
  return r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

const MODES = ["light", "dark"] as const;

for (const mode of MODES) {
  test.describe(`a11y structure, ${mode} mode`, () => {
    test.beforeEach(async ({ page }) => {
      await mountConfig(page, {}, {}, "healthy");
      await page.emulateMedia({ colorScheme: mode });
      await page.addInitScript((m) => localStorage.setItem("template-ui-theme", m), mode);
    });

    test("R1/U1: home has no region or landmark violations and exactly one main", async ({ page }) => {
      await page.goto("/");
      await page.waitForSelector("textarea", { state: "visible" });
      expect(await structural(page)).toEqual([]);
      await expect(page.getByRole("main")).toHaveCount(1);
      // The sidebar search/footer live inside a navigation landmark.
      await expect(page.locator("#app-sidebar nav")).toHaveCount(1);
    });

    for (const tab of ["Your Memories", "Custom Rules", "Authorization"] as const) {
      test(`R2: settings ${tab} keeps heading order`, async ({ page }) => {
        await page.goto("/settings");
        await page.waitForSelector("h1", { state: "visible" });
        await page
          .getByRole("navigation", { name: "Settings sections" })
          .getByRole("link", { name: tab })
          .click();
        await page.waitForSelector("#settings-panel", { state: "visible" });
        expect(await structural(page)).toEqual([]);
      });
    }
  });
}

test.describe("keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await mountConfig(page, {}, {}, "healthy");
  });

  test("U2: skip link is the first Tab stop and moves focus to main", async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector("textarea", { state: "visible" });
    // First tabbable element in DOM order (excluding inert/hidden subtrees) must be the skip link.
    const first = await page.evaluate(() => {
      const sel = 'a[href],button,input,textarea,select,[tabindex]:not([tabindex="-1"])';
      const el = [...document.querySelectorAll<HTMLElement>(sel)].find(
        (e) => !e.closest("[inert]") && !e.hasAttribute("disabled") && e.tabIndex >= 0,
      );
      return el?.textContent?.trim();
    });
    expect(first).toBe("Skip to main content");
    const skip = page.getByRole("link", { name: /skip to main content/i });
    await skip.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("main#main-content")).toBeFocused();
  });

  test("U3: closed overlay sidebar at 375px is not in the Tab order", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/");
    await page.waitForSelector("textarea", { state: "attached" });
    const sidebar = page.locator("#app-sidebar");
    const toggle = page.getByRole("button", { name: /^Toggle (sidebar|navigation)$/i }).first();
    if ((await toggle.getAttribute("aria-expanded")) === "true") await toggle.click();
    await expect(sidebar).toHaveAttribute("inert", "");
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const inside = await page.evaluate(() => !!document.activeElement?.closest("#app-sidebar"));
      expect(inside).toBe(false);
    }
  });
});

test("U5: composer shows a 2px ring only while the textarea is focused", async ({ page }) => {
  await mountConfig(page, {}, {}, "healthy");
  await page.goto("/");
  const box = page.locator(".composer-box").first();
  const ring = () => box.evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.outlineStyle === "none" ? "none" : cs.outlineWidth;
    });
  await page.locator("textarea").first().focus();
  expect(await ring()).toBe("2px");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  expect(await ring()).toBe("none");
});
