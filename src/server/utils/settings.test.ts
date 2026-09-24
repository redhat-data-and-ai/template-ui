import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getSettings, resetSettings } from "./settings.js";
import { writeFileSync, unlinkSync, mkdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("Config Settings Validation", () => {
  const testConfigPath = resolve(__dirname, "../../../config/ui/test-settings.yaml");
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original env
    originalEnv = { ...process.env };
    // Clear settings cache for fresh test
    resetSettings();
    // Ensure config directory exists for tests
    const configDir = resolve(__dirname, "../../../config/ui");
    mkdirSync(configDir, { recursive: true });
  });

  afterEach(() => {
    // Restore env
    process.env = originalEnv;
    // Clean up test file
    try {
      if (existsSync(testConfigPath)) {
        unlinkSync(testConfigPath);
      }
    } catch {
      // Ignore
    }
  });

  it("should load valid YAML and return typed config object", () => {
    const validYaml = `
branding:
  logo_url: "/test-logo.svg"
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
features:
  debug_mode_default: true
  auth_enabled: false
agent:
  endpoint: ""
  timeout_ms: 60000
  streaming: true
`;

    writeFileSync(testConfigPath, validYaml);
    process.env.UI_CONFIG_PATH = testConfigPath;

    const settings = getSettings();

    expect(settings.branding.logo_url).toBe("/test-logo.svg");
    expect(settings.branding.title).toBe("Test Agent");
    expect(settings.branding.colors.light.primary).toBe("#ff0000");
    expect(settings.features.debug_mode_default).toBe(true);
    expect(settings.features.auth_enabled).toBe(false);
    expect(settings.features.mcp_apps_enabled).toBe(true);
    expect(settings.security.helmet.csp.frame_src).toContain("'self'");
    expect(settings.agent.timeout_ms).toBe(60000);
  });

  it("should throw when UI_CONFIG_PATH points to missing file", () => {
    process.env.UI_CONFIG_PATH = "/nonexistent/path/settings.yaml";

    expect(() => getSettings()).toThrow(
      "Config file not found: /nonexistent/path/settings.yaml",
    );
  });
  
  it("should throw when UI_CONFIG_PATH points to missing file in project dir", () => {
    process.env.UI_CONFIG_PATH = resolve(__dirname, "../../../config/ui/does-not-exist-xyz.yaml");

    expect(() => getSettings()).toThrow(/Config file not found/);
  });

  it("should accept empty logo_url since it is optional", () => {
    const yaml = `
branding:
  logo_url: ""
  title: "Test"
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

    writeFileSync(testConfigPath, yaml);
    process.env.UI_CONFIG_PATH = testConfigPath;

    const settings = getSettings();
    expect(settings.branding.logo_url).toBe("");
    expect(settings.branding.title).toBe("Test");
  });

  it("should throw error for invalid hex color", () => {
    const invalidYaml = `
branding:
  logo_url: "/test.svg"
  title: "Test"
  colors:
    light:
      primary: "not-a-color"
      accent: "#00ff00"
      background: "#ffffff"
      foreground: "#000000"
    dark:
      primary: "#ff00ff"
      accent: "#00ffff"
      background: "#000000"
      foreground: "#ffffff"
`;

    writeFileSync(testConfigPath, invalidYaml);
    process.env.UI_CONFIG_PATH = testConfigPath;

    expect(() => getSettings()).toThrow(
      "Config validation error: branding.colors.light.primary must be a valid hex color (got 'not-a-color')"
    );
  });

  it("should throw error for invalid feature flag type", () => {
    const invalidYaml = `
branding:
  logo_url: "/test.svg"
  title: "Test"
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
features:
  debug_mode_default: "yes"
`;

    writeFileSync(testConfigPath, invalidYaml);
    process.env.UI_CONFIG_PATH = testConfigPath;

    expect(() => getSettings()).toThrow("Config validation error: features.debug_mode_default must be boolean");
  });

  it("should throw error for negative timeout", () => {
    const invalidYaml = `
branding:
  logo_url: "/test.svg"
  title: "Test"
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
agent:
  timeout_ms: -1000
`;

    writeFileSync(testConfigPath, invalidYaml);
    process.env.UI_CONFIG_PATH = testConfigPath;

    expect(() => getSettings()).toThrow("Config validation error: agent.timeout_ms must be a positive number");
  });

  it("should throw error for invalid agent URL", () => {
    const invalidYaml = `
branding:
  logo_url: "/test.svg"
  title: "Test"
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
agent:
  endpoint: "not-a-url"
  timeout_ms: 30000
`;

    writeFileSync(testConfigPath, invalidYaml);
    process.env.UI_CONFIG_PATH = testConfigPath;

    expect(() => getSettings()).toThrow(
      "Config validation error: agent.endpoint must be a valid URL (got 'not-a-url')"
    );
  });

  it("should allow empty agent endpoint", () => {
    const validYaml = `
branding:
  logo_url: "/test.svg"
  title: "Test"
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
agent:
  endpoint: ""
  timeout_ms: 30000
  streaming: true
`;

    writeFileSync(testConfigPath, validYaml);
    process.env.UI_CONFIG_PATH = testConfigPath;

    const settings = getSettings();
    expect(settings.agent.endpoint).toBe("");
  });

  it("should apply environment variable overrides", () => {
    const yamlConfig = `
branding:
  logo_url: "/yaml-logo.svg"
  title: "YAML Title"
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

    writeFileSync(testConfigPath, yamlConfig);
    process.env.UI_CONFIG_PATH = testConfigPath;
    process.env.BRANDING_TITLE = "Env Title Override";
    process.env.BRANDING_LOGO_URL = "/env-logo.svg";
    process.env.FEATURE_AUTH_ENABLED = "false";

    const settings = getSettings();

    expect(settings.branding.title).toBe("Env Title Override");
    expect(settings.branding.logo_url).toBe("/env-logo.svg");
    expect(settings.features.auth_enabled).toBe(false);
  });

  it("should merge partial YAML with defaults", () => {
    const partialYaml = `
branding:
  logo_url: "/custom-logo.svg"
  title: "Custom Title"
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

    writeFileSync(testConfigPath, partialYaml);
    process.env.UI_CONFIG_PATH = testConfigPath;

    const settings = getSettings();

    // Custom values from YAML
    expect(settings.branding.logo_url).toBe("/custom-logo.svg");
    expect(settings.branding.title).toBe("Custom Title");

    // Default values for sections not in YAML
    expect(settings.features.debug_mode_default).toBe(false);
    expect(settings.agent.timeout_ms).toBe(30000);
    expect(settings.server.port).toBe(8080);
  });

  it("should validate all 8 color fields", () => {
    const invalidDarkColor = `
branding:
  logo_url: "/test.svg"
  title: "Test"
  colors:
    light:
      primary: "#ff0000"
      accent: "#00ff00"
      background: "#ffffff"
      foreground: "#000000"
    dark:
      primary: "#ff00ff"
      accent: "#00ffff"
      background: "invalid"
      foreground: "#ffffff"
`;

    writeFileSync(testConfigPath, invalidDarkColor);
    process.env.UI_CONFIG_PATH = testConfigPath;

    expect(() => getSettings()).toThrow(
      "Config validation error: branding.colors.dark.background must be a valid hex color (got 'invalid')"
    );
  });
});
