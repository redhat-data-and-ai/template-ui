import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTestStore } from "../test-utils/createTestStore";
import { setDeveloperMode } from "../redux/slices/userSettings";
import { themeStorageKey } from "../lib/theme-storage";
import { SettingsPage } from "./SettingsPage";

vi.mock("../services/agent-structure", () => ({
  fetchAgentStructure: vi.fn(async () => {
    throw new Error("unavailable");
  }),
}));
vi.mock("../services/mcp-oauth-api", () => ({
  fetchMcpOAuthConnections: vi.fn(async () => []),
}));
vi.mock("../hooks/useEvalDashboard", () => ({
  useEvalDashboard: () => ({
    evalState: { status: "unknown", score: null, pass: 0, fail: 0, error: 0 },
    isRunning: false,
    result: null,
    history: null,
    trends: null,
    triggerState: { status: "idle", message: "" },
    triggeredAt: null,
    isCached: false,
    hasTriggered: false,
    trigger: vi.fn(),
    authRequired: [],
    clearAuthRequired: vi.fn(),
  }),
}));
vi.mock("../hooks/useDatasetPresence", () => ({
  useDatasetPresence: () => ({ hasCases: false }),
}));

function renderPage(developer = false) {
  const store = createTestStore();
  if (developer) store.dispatch(setDeveloperMode(true));
  render(
    <Provider store={store}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </Provider>,
  );
  return store;
}

const nav = () => screen.getByRole("navigation", { name: "Settings sections" });

describe("SettingsPage", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(window, {
      APP_DATA: { userRole: "users" },
      USER_DATA: { displayName: "Dev", preferred_username: "dev" },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ hasConsent: false, grantedAt: null }),
      })),
    );
  });

  it("lists sections in order without Developer by default", () => {
    renderPage();
    const names = within(nav())
      .getAllByRole("link")
      .map((l) => l.textContent);
    expect(names).toEqual([
      "Profile",
      "Your Memories",
      "Custom Rules",
      "Appearance",
      "Tool Approvals",
      "Authorization",
      "MCP OAuth",
    ]);
  });

  it("opens each section by nav name and marks it current", async () => {
    const user = userEvent.setup();
    renderPage();
    for (const name of [
      "Your Memories",
      "Custom Rules",
      "Appearance",
      "Tool Approvals",
      "Authorization",
      "MCP OAuth",
      "Profile",
    ]) {
      await user.click(within(nav()).getByRole("link", { name }));
      expect(within(nav()).getByRole("link", { name })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(
        await screen.findByRole("heading", { name, level: 2 }),
      ).toBeInTheDocument();
    }
  });

  it("shows Developer only when developer mode is on and the role is privileged", async () => {
    Object.assign(window, { APP_DATA: { userRole: "builders" } });
    renderPage(true);
    const user = userEvent.setup();
    await user.click(within(nav()).getByRole("link", { name: "Developer" }));
    expect(await screen.findByText("Agent Information")).toBeInTheDocument();
  });

  it("Developer: Agent Information and Agent Evaluation are separate collapsible cards", async () => {
    Object.assign(window, { APP_DATA: { userRole: "builders" } });
    renderPage(true);
    const user = userEvent.setup();
    await user.click(within(nav()).getByRole("link", { name: "Developer" }));
    const info = await screen.findByRole("button", { name: "Agent Information" });
    const evaluation = screen.getByRole("button", { name: "Agent Evaluation" });
    expect(info).toHaveAttribute("aria-expanded", "true");
    expect(evaluation).toHaveAttribute("aria-expanded", "true");
    expect(info.closest("#dev-agent-information")).not.toBe(evaluation.closest("#dev-agent-evaluation"));
    await user.click(info);
    expect(info).toHaveAttribute("aria-expanded", "false");
    expect(evaluation).toHaveAttribute("aria-expanded", "true");
  });

  it("Appearance: Light selected for light theme; choosing Dark persists it", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(within(nav()).getByRole("link", { name: "Appearance" }));
    expect(screen.getByRole("radio", { name: "Light" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Dark" }));
    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
    expect(localStorage.getItem(themeStorageKey())).toBe("dark");
  });
});

describe("SettingsPage narrow layout", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.assign(window, {
      APP_DATA: { userRole: "users" },
      USER_DATA: { displayName: "Dev", preferred_username: "dev" },
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: (query: string) => ({
        matches: query.includes("max-width"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });
  afterEach(() => {
    delete (window as { matchMedia?: unknown }).matchMedia;
  });

  it("renders horizontal tabs instead of the vertical nav, hiding Developer by default", async () => {
    renderPage();
    expect(screen.queryByRole("navigation", { name: "Settings sections" })).toBeNull();
    const tabs = within(screen.getByRole("tablist")).getAllByRole("tab").map((t) => t.textContent);
    expect(tabs).toEqual([
      "Profile", "Your Memories", "Custom Rules", "Appearance", "Tool Approvals", "Authorization", "MCP OAuth",
    ]);
    await userEvent.click(screen.getByRole("tab", { name: "Appearance" }));
    expect(screen.getByRole("tab", { name: "Appearance" })).toHaveAttribute("aria-selected", "true");
    expect(document.getElementById("settings-title-appearance")).not.toBeNull();
  });

  it("names the tablist itself", () => {
    renderPage();
    expect(screen.getByRole("tablist", { name: "Settings sections" })).toBeInTheDocument();
  });
});
