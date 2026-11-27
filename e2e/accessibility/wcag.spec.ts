/**
 * WCAG 2.1 AA E2E accessibility tests using axe-core/playwright.
 *
 * Unlike the jest-axe unit tests, these run in a real Chromium browser so
 * color-contrast and other rules that need computed styles are fully checked.
 *
 * Covers:
 *  - Home page
 *  - Chat page after a streamed response
 *  - Settings page — all 6 tab panels
 *  Every suite runs in both light and dark mode.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mountConfig } from "../helpers/config-mount";
import { mockAgentStream } from "../helpers/sse-mock";
import { HomePage } from "../page-objects/HomePage";
import { ChatPage } from "../page-objects/ChatPage";
import { SettingsPage } from "../page-objects/SettingsPage";

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21aa"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function runAxe(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page })
    .withTags(AXE_TAGS)
    // Exclude content that is explicitly hidden from the accessibility tree.
    // aria-hidden elements are not exposed to AT users; colour-contrast rules
    // are still enforced on all other visible content.
    .exclude('[aria-hidden="true"]')
    .analyze();
  return results.violations;
}

const SETTINGS_TABS = [
  "Profile",
  "Your Memories",
  "Custom Rules",
  "Appearance",
  "Tool Approvals",
  "MCP OAuth",
] as const;

const MODES = ["light", "dark"] as const;
type Mode = (typeof MODES)[number];

// 'default' = no branding.colors (the shipped palette); 'branded' = injected colours (regression).
const PALETTES = ["default", "branded"] as const;
type Palette = (typeof PALETTES)[number];

function mountPalette(page: import("@playwright/test").Page, palette: Palette) {
  return mountConfig(page, {}, {}, "healthy", {
    defaultPalette: palette === "default",
  });
}

/** Seed the explicit theme choice (same key the app reads) before first paint. */
async function seedTheme(page: import("@playwright/test").Page, mode: Mode) {
  await page.emulateMedia({ colorScheme: mode });
  await page.addInitScript((m) => {
    localStorage.setItem("template-ui-theme", m);
  }, mode);
}

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

test.describe.parallel("WCAG 2.1 AA", () => {
  for (const palette of PALETTES)
    for (const mode of MODES) {
      test.describe(`${palette} palette, ${mode} mode`, () => {
        test.describe("Home page", () => {
          test.beforeEach(async ({ page }) => {
            await mountPalette(page, palette);
            await seedTheme(page, mode);
          });

          test("has no violations", async ({ page }) => {
            await page.goto("/");
            await page.waitForSelector("textarea", { state: "visible" });
            const violations = await runAxe(page);
            expect(violations, formatViolations(violations)).toHaveLength(0);
          });
        });

        test.describe("PF link colour token", () => {
          test.beforeEach(async ({ page }) => {
            await mountPalette(page, palette);
            await seedTheme(page, mode);
          });

          // Link-variant buttons use PF's brand colour; plain links (Content, Menu, Breadcrumb) use the
          // link token that the theme overrides. Pin its contrast on page and card backgrounds.
          test("plain link text meets AA contrast", async ({ page }) => {
            await page.goto("/");
            await page.waitForSelector("textarea", { state: "visible" });
            const ratios = await page.evaluate(() => {
              const host = document.createElement("div");
              host.className = "pf-v6-c-content";
              host.innerHTML = '<a href="#probe">Probe link text</a>';
              document.body.appendChild(host);
              const resolve = (value: string) => {
                const el = document.createElement("span");
                el.style.color = value;
                document.body.appendChild(el);
                const m = getComputedStyle(el)
                  .color.match(/[\d.]+/g)!
                  .map(Number);
                el.remove();
                return m.slice(0, 3);
              };
              const lum = ([r, g, b]: number[]) => {
                const f = (c: number) =>
                  (c /= 255) <= 0.03928
                    ? c / 12.92
                    : ((c + 0.055) / 1.055) ** 2.4;
                return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
              };
              const ratio = (a: number[], b: number[]) => {
                const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
                return (hi + 0.05) / (lo + 0.05);
              };
              const link = resolve(
                getComputedStyle(host.querySelector("a")!).color,
              );
              const root = getComputedStyle(document.documentElement);
              return ["--app-page-bg", "--app-surface-raised"].map((v) =>
                ratio(link, resolve(root.getPropertyValue(v).trim())),
              );
            });
            for (const r of ratios) expect(r).toBeGreaterThanOrEqual(4.5);
          });
        });

        test.describe("New Project modal (link-variant Cancel button)", () => {
          test.beforeEach(async ({ page }) => {
            await mountPalette(page, palette);
            await seedTheme(page, mode);
          });

          test("has no violations", async ({ page }) => {
            await page.goto("/");
            await page
              .getByRole("button", { name: /new project/i })
              .first()
              .click();
            const dialog = page.getByRole("dialog");
            await dialog
              .getByRole("button", { name: "Cancel" })
              .waitFor({ state: "visible" });
            await page.waitForTimeout(300); // modal animation
            const violations = await runAxe(page);
            expect(violations, formatViolations(violations)).toHaveLength(0);
          });
        });

        test.describe("Chat page", () => {
          test.beforeEach(async ({ page }) => {
            await mountPalette(page, palette);
            await seedTheme(page, mode);
            await mockAgentStream(
              page,
              "Hello! I can help with data analysis and queries.",
            );
          });

          test("after AI response has no violations", async ({ page }) => {
            await page.emulateMedia({
              colorScheme: mode,
              reducedMotion: "reduce",
            });
            const home = new HomePage(page);
            const chat = new ChatPage(page);

            await home.goto();
            await home.submitPrompt("What can you do?");
            await chat.waitForAIResponse();

            const violations = await runAxe(page);
            expect(violations, formatViolations(violations)).toHaveLength(0);
          });
        });

        // Settings: each tab panel is tested individually since only the active
        // panel is in the visible DOM at a time.
        test.describe("Settings page", () => {
          test.beforeEach(async ({ page }) => {
            await mountPalette(page, palette);
            await seedTheme(page, mode);
          });

          for (const tab of SETTINGS_TABS) {
            test(`${tab} tab has no violations`, async ({ page }) => {
              const settings = new SettingsPage(page);
              await settings.goto();
              await settings.selectTab(tab);
              await page.waitForTimeout(150); // let panel paint

              const violations = await runAxe(page);
              expect(violations, formatViolations(violations)).toHaveLength(0);
            });
          }
        });
      });
    }
});

// ---------------------------------------------------------------------------
// Utility: format axe violations for readable test failure messages
// ---------------------------------------------------------------------------

function formatViolations(violations: import("axe-core").Result[]): string {
  if (violations.length === 0) return "";
  return (
    `\n\n${violations.length} axe violation(s):\n` +
    violations
      .map(
        (v, i) =>
          `  ${i + 1}. [${v.impact}] ${v.id}: ${v.description}\n` +
          v.nodes
            .slice(0, 2)
            .map((n) => `     → ${n.html.slice(0, 120)}`)
            .join("\n"),
      )
      .join("\n\n")
  );
}
