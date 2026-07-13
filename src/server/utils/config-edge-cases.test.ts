import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getSettings, resetSettings } from "./settings.js";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const configDir = resolve(__dirname, "../../../config/ui");
const testConfigPath = resolve(configDir, "edge-case-settings.yaml");

// Minimal valid YAML that passes all validation
const VALID_YAML_BASE = `
branding:
  title: "Test Agent"
  colors:
    light:
      primary: "#ff0000"
      accent: "#00ff00"
      background: "#ffffff"
      foreground: "#000000"
    dark:
      primary: "#ff00ff"
      accent: "#00ffff"
      background: "#000000"
      foreground: "#ffffff"
`;

function saveEnv(...keys: string[]) {
  const saved: Record<string, string | undefined> = {};
  for (const k of keys) saved[k] = process.env[k];
  return () => {
    for (const k of keys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
}

beforeEach(() => {
  resetSettings();
  mkdirSync(configDir, { recursive: true });
  delete process.env.UI_CONFIG_PATH;
});

afterEach(() => {
  resetSettings();
  try {
    if (existsSync(testConfigPath)) unlinkSync(testConfigPath);
  } catch { /* ignore */ }
});

// ── Invalid YAML → clear error ─────────────────────────────────────────────

describe("Invalid YAML → clear parse error", () => {
  it("throws a descriptive error for syntactically broken YAML", () => {
    writeFileSync(testConfigPath, "key: value:\n  bad: [indent\n");
    process.env.UI_CONFIG_PATH = testConfigPath;

    expect(() => getSettings()).toThrow(/Config parse error: invalid YAML/);
  });

  it("error message includes the config file path", () => {
    writeFileSync(testConfigPath, ": invalid_start\n  broken\n");
    process.env.UI_CONFIG_PATH = testConfigPath;

    expect(() => getSettings()).toThrow(testConfigPath);
  });

  it("throws for YAML with an unclosed flow sequence", () => {
    writeFileSync(testConfigPath, "items: [one, two\n");
    process.env.UI_CONFIG_PATH = testConfigPath;

    expect(() => getSettings()).toThrow(/Config parse error/);
  });
});

// ── Missing YAML → graceful fallback to defaults ────────────────────────────

describe("Missing YAML → throws when UI_CONFIG_PATH is explicit", () => {
  it("throws when explicit UI_CONFIG_PATH points to nonexistent file", () => {
    process.env.UI_CONFIG_PATH = resolve(configDir, "nonexistent-99999.yaml");

    expect(() => getSettings()).toThrow(/Config file not found/);
  });

  it("returns defaults when no UI_CONFIG_PATH is set and default file is missing", () => {
    delete process.env.UI_CONFIG_PATH;
    const settings = getSettings();

    expect(settings.branding.title).toBe("Deep Agent");
    expect(settings.features.auth_enabled).toBe(true);
    expect(settings.agent.timeout_ms).toBe(30000);
    expect(settings.server.port).toBe(8080);
    expect(settings.server.host).toBe("0.0.0.0");
  });
});

// ── Empty / comment-only YAML → graceful fallback ──────────────────────────

describe("Empty or comment-only YAML → graceful fallback", () => {
  it("falls back to defaults when config file is empty", () => {
    writeFileSync(testConfigPath, "");
    process.env.UI_CONFIG_PATH = testConfigPath;

    const settings = getSettings();
    expect(settings.branding.title).toBe("Deep Agent");
    expect(settings.features.auth_enabled).toBe(true);
  });

  it("falls back to defaults when config file contains only comments", () => {
    writeFileSync(testConfigPath, "# This is a placeholder\n# No actual config here\n");
    process.env.UI_CONFIG_PATH = testConfigPath;

    const settings = getSettings();
    expect(settings.branding.title).toBe("Deep Agent");
    expect(settings.agent.timeout_ms).toBe(30000);
  });
});

// ── Feature flags ───────────────────────────────────────────────────────────

describe("Feature flags toggle", () => {
  it("FEATURE_AUTH_ENABLED=true enables auth", () => {
    const restore = saveEnv("FEATURE_AUTH_ENABLED", "AUTH_ENABLED");
    process.env.FEATURE_AUTH_ENABLED = "true";
    delete process.env.AUTH_ENABLED;

    const settings = getSettings();
    expect(settings.features.auth_enabled).toBe(true);
    restore();
  });

  it("FEATURE_AUTH_ENABLED=false disables auth", () => {
    const restore = saveEnv("FEATURE_AUTH_ENABLED", "AUTH_ENABLED");
    process.env.FEATURE_AUTH_ENABLED = "false";
    delete process.env.AUTH_ENABLED;

    const settings = getSettings();
    expect(settings.features.auth_enabled).toBe(false);
    restore();
  });

  it("legacy AUTH_ENABLED=false disables auth when FEATURE_AUTH_ENABLED not set", () => {
    const restore = saveEnv("FEATURE_AUTH_ENABLED", "AUTH_ENABLED");
    delete process.env.FEATURE_AUTH_ENABLED;
    process.env.AUTH_ENABLED = "false";

    const settings = getSettings();
    expect(settings.features.auth_enabled).toBe(false);
    restore();
  });

  it("FEATURE_AUTH_ENABLED takes precedence over legacy AUTH_ENABLED", () => {
    const restore = saveEnv("FEATURE_AUTH_ENABLED", "AUTH_ENABLED");
    process.env.FEATURE_AUTH_ENABLED = "true";
    process.env.AUTH_ENABLED = "false"; // should be ignored

    const settings = getSettings();
    expect(settings.features.auth_enabled).toBe(true);
    restore();
  });

  it("FEATURE_DEBUG_MODE_DEFAULT=true enables debug mode", () => {
    const restore = saveEnv("FEATURE_DEBUG_MODE_DEFAULT");
    process.env.FEATURE_DEBUG_MODE_DEFAULT = "true";

    const settings = getSettings();
    expect(settings.features.debug_mode_default).toBe(true);
    restore();
  });

  it("FEATURE_DEBUG_MODE_DEFAULT=false keeps debug mode off", () => {
    const restore = saveEnv("FEATURE_DEBUG_MODE_DEFAULT");
    process.env.FEATURE_DEBUG_MODE_DEFAULT = "false";

    const settings = getSettings();
    expect(settings.features.debug_mode_default).toBe(false);
    restore();
  });
});

// ── Env override precedence ─────────────────────────────────────────────────

describe("Env override precedence over YAML", () => {
  it("BRANDING_TITLE env overrides YAML branding title", () => {
    writeFileSync(testConfigPath, VALID_YAML_BASE + 'agent:\n  timeout_ms: 30000\n  streaming: true\n  endpoint: ""\n');
    const restore = saveEnv("UI_CONFIG_PATH", "BRANDING_TITLE");
    process.env.UI_CONFIG_PATH = testConfigPath;
    process.env.BRANDING_TITLE = "Overridden By Env";

    const settings = getSettings();
    expect(settings.branding.title).toBe("Overridden By Env");
    restore();
  });

  it("BRANDING_PRIMARY_LIGHT env overrides YAML primary color", () => {
    writeFileSync(testConfigPath, VALID_YAML_BASE + 'agent:\n  timeout_ms: 30000\n  streaming: true\n  endpoint: ""\n');
    const restore = saveEnv("UI_CONFIG_PATH", "BRANDING_PRIMARY_LIGHT");
    process.env.UI_CONFIG_PATH = testConfigPath;
    process.env.BRANDING_PRIMARY_LIGHT = "#123456";

    const settings = getSettings();
    expect(settings.branding.colors.light.primary).toBe("#123456");
    restore();
  });

  it("AGENT_TIMEOUT_MS env overrides YAML timeout", () => {
    writeFileSync(testConfigPath, VALID_YAML_BASE + "agent:\n  timeout_ms: 5000\n  streaming: true\n  endpoint: \"\"\n");
    const restore = saveEnv("UI_CONFIG_PATH", "AGENT_TIMEOUT_MS");
    process.env.UI_CONFIG_PATH = testConfigPath;
    process.env.AGENT_TIMEOUT_MS = "99000";

    const settings = getSettings();
    expect(settings.agent.timeout_ms).toBe(99000);
    restore();
  });

  it("AGENT_ENDPOINT env sets endpoint value", () => {
    writeFileSync(testConfigPath, VALID_YAML_BASE + 'agent:\n  timeout_ms: 30000\n  streaming: true\n  endpoint: ""\n');
    const restore = saveEnv("UI_CONFIG_PATH", "AGENT_ENDPOINT");
    process.env.UI_CONFIG_PATH = testConfigPath;
    process.env.AGENT_ENDPOINT = "http://my-agent.example.com";

    const settings = getSettings();
    expect(settings.agent.endpoint).toBe("http://my-agent.example.com");
    restore();
  });
});

// ── Config reload (ConfigMap reload) ────────────────────────────────────────

describe("Config reload via resetSettings()", () => {
  it("resetSettings() clears cache so next call picks up new env var", () => {
    const restore = saveEnv("BRANDING_TITLE");
    process.env.BRANDING_TITLE = "First Title";
    const first = getSettings();
    expect(first.branding.title).toBe("First Title");

    resetSettings();
    process.env.BRANDING_TITLE = "Second Title";
    const second = getSettings();
    expect(second.branding.title).toBe("Second Title");
    restore();
  });

  it("resetSettings() clears cache so next call reads updated config file", () => {
    writeFileSync(testConfigPath, VALID_YAML_BASE + 'agent:\n  timeout_ms: 30000\n  streaming: true\n  endpoint: ""\n');
    process.env.UI_CONFIG_PATH = testConfigPath;

    const first = getSettings();
    expect(first.branding.title).toBe("Test Agent");

    // Simulate ConfigMap update: write new content and reload
    resetSettings();
    writeFileSync(
      testConfigPath,
      VALID_YAML_BASE.replace("Test Agent", "Reloaded Agent") +
        'agent:\n  timeout_ms: 30000\n  streaming: true\n  endpoint: ""\n',
    );

    const second = getSettings();
    expect(second.branding.title).toBe("Reloaded Agent");
  });
});
