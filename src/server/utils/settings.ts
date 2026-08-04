import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface CspConfig {
  default_src: string[];
  script_src: string[];
  style_src: string[];
  img_src: string[];
  connect_src: string[];
  font_src: string[];
  object_src: string[];
  frame_src: string[];
  frame_ancestors: string[];
}

interface HelmetConfig {
  enabled: boolean;
  csp: CspConfig;
  cross_origin_embedder_policy: boolean;
}

interface RateLimitConfig {
  enabled: boolean;
  max: number;
  window: string;
  exclude_paths: string[];
}

interface SessionConfig {
  secure_cookie: boolean;
  max_age_days: number;
  http_only: boolean;
  same_site: 'strict' | 'lax' | 'none';
}

interface SecurityConfig {
  helmet: HelmetConfig;
  rate_limit: RateLimitConfig;
  session: SessionConfig;
}

interface OtelConfig {
  enabled: boolean;
  service_name: string;
}

interface PlatformOpaConfig {
  enabled: boolean;
  policy_path: string;
  fail_on_violation: boolean;
  approved_auth_providers: string[];
  internal_endpoint_suffixes: string[];
  max_session_ttl_days: number;
  restrict_debug_mode: boolean;
  restricted_features: string[];
  max_rate_limit: number;
}

interface PlatformConfig {
  opa: PlatformOpaConfig;
}

interface AnnouncementConfig {
  enabled: boolean;
  message: string;
  type: string;
}

interface ServerConfig {
  host: string;
  port: number;
  body_limit: number;
}

interface LoggingConfig {
  level: string;
}

interface CorsConfig {
  origin: string;
}

interface BrandingThemeColors {
  primary: string;
  accent: string;
  background: string;
  foreground: string;
}

interface BrandingConfig {
  logo_url?: string;
  title: string;
  favicon_url?: string;
  colors: {
    light: BrandingThemeColors;
    dark: BrandingThemeColors;
  };
}

interface FeaturesConfig {
  memory_enabled: boolean;
  user_rules_enabled: boolean;
  debug_mode_default: boolean;
  auth_enabled: boolean;
  mcp_dcr_enabled: boolean;
  mcp_apps_enabled: boolean;
}

interface AgentConfig {
  endpoint: string;
  timeout_ms: number;
  streaming: boolean;
}

interface AuthConfig {
  enabled: boolean;
  sso_client_id: string;
  sso_client_secret: string;  // SECURITY: Never set in YAML - only via SSO_CLIENT_SECRET env var
  sso_issuer_host: string;
  sso_callback_url: string;
}

export interface UISettings {
  branding: BrandingConfig;
  features: FeaturesConfig;
  agent: AgentConfig;
  auth: AuthConfig;
  server: ServerConfig;
  logging: LoggingConfig;
  cors: CorsConfig;
  security: SecurityConfig;
  otel: OtelConfig;
  announcement: AnnouncementConfig;
  platform: PlatformConfig;
}

const DEFAULTS: UISettings = {
  branding: {
    logo_url: "",
    title: "Deep Agent",
    favicon_url: "",
    colors: {
      light: {
        primary: "#0066cc",
        accent: "#a60000",
        background: "#ffffff",
        foreground: "#1a1a1a",
      },
      dark: {
        primary: "#4dabf7",
        accent: "#f56e6e",
        background: "#0a1628",
        foreground: "#f0f4f8",
      },
    },
  },
  features: {
    debug_mode_default: false,
    auth_enabled: true,
    mcp_dcr_enabled: true,
    mcp_apps_enabled: true,
    memory_enabled: true,
    user_rules_enabled: true,
  },
  agent: {
    endpoint: "",
    timeout_ms: 30000,
    streaming: true,
  },
  auth: {
    enabled: true,
    sso_client_id: "",  // Always from SSO_CLIENT_ID env var
    sso_client_secret: "",  // Always from SSO_CLIENT_SECRET env var (secret)
    sso_issuer_host: "",  // Always from SSO_ISSUER_HOST env var
    sso_callback_url: "",  // Always from SSO_CALLBACK_URL env var
  },
  server: { host: "0.0.0.0", port: 8080, body_limit: 1_048_576 },
  logging: { level: "info" },
  cors: { origin: "http://localhost:8080" },
  security: {
    helmet: {
      enabled: true,
      csp: {
        default_src: ["'self'"],
        script_src: ["'self'"],
        style_src: ["'self'", "'unsafe-inline'"],
        img_src: ["'self'", "data:", "blob:", "https:"],
        connect_src: ["'self'"],
        font_src: ["'self'", "data:"],
        object_src: ["'none'"],
        frame_src: ["'self'"],
        frame_ancestors: ["'none'"],
      },
      cross_origin_embedder_policy: false,
    },
    rate_limit: {
      enabled: true,
      max: 100,
      window: "1 minute",
      exclude_paths: ["/api/health", "/_health", "/api/proxy/agent/evals/status", "/api/proxy/agent/evals/results", "/api/proxy/agent/evals/history", "/api/proxy/agent/evals/trends"],
    },
    session: {
      secure_cookie: false, // false for dev; set to true in production
      max_age_days: 30,
      http_only: true,
      same_site: 'lax', // 'lax' allows OAuth2 callback flows; use 'strict' only if not using SSO
    },
  },
  otel: { enabled: false, service_name: "template-ui" },
  announcement: { enabled: false, message: "", type: "info" },
  platform: {
    opa: {
      enabled: false,
      policy_path: "",
      fail_on_violation: false,
      approved_auth_providers: [],
      internal_endpoint_suffixes: [],
      max_session_ttl_days: 0,
      restrict_debug_mode: false,
      restricted_features: [],
      max_rate_limit: 0,
    },
  },
};

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    const bVal = result[key];
    const oVal = override[key];
    if (
      bVal &&
      oVal &&
      typeof bVal === "object" &&
      typeof oVal === "object" &&
      !Array.isArray(bVal) &&
      !Array.isArray(oVal)
    ) {
      result[key] = deepMerge(
        bVal as Record<string, unknown>,
        oVal as Record<string, unknown>,
      );
    } else {
      result[key] = oVal;
    }
  }
  return result as T;
}

function loadYaml(filePath: string): Record<string, unknown> | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT" || code === "ENOTDIR") {
      return null;
    }
    throw err;
  }

  try {
    const parsed = yaml.load(raw) as Record<string, unknown>;
    return parsed ?? null;
  } catch (parseError) {
    const msg = parseError instanceof Error ? parseError.message : String(parseError);
    throw new Error(`Config parse error: invalid YAML in "${filePath}": ${msg}`);
  }
}

function isValidUrl(urlString: string): boolean {
  try {
    new URL(urlString);
    return true;
  } catch {
    return false;
  }
}

function validateConfig(config: UISettings): void {
  const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;

  // Branding validation
  if (!config.branding.title || config.branding.title.trim() === "") {
    throw new Error("Config validation error: branding.title is required");
  }

  // Color validation
  const validateColor = (path: string, value: string) => {
    if (!hexColorRegex.test(value)) {
      throw new Error(
        `Config validation error: ${path} must be a valid hex color (got '${value}')`,
      );
    }
  };

  validateColor("branding.colors.light.primary", config.branding.colors.light.primary);
  validateColor("branding.colors.light.accent", config.branding.colors.light.accent);
  validateColor("branding.colors.light.background", config.branding.colors.light.background);
  validateColor("branding.colors.light.foreground", config.branding.colors.light.foreground);
  validateColor("branding.colors.dark.primary", config.branding.colors.dark.primary);
  validateColor("branding.colors.dark.accent", config.branding.colors.dark.accent);
  validateColor("branding.colors.dark.background", config.branding.colors.dark.background);
  validateColor("branding.colors.dark.foreground", config.branding.colors.dark.foreground);

  // Feature flags type validation
  if (typeof config.features.debug_mode_default !== "boolean") {
    throw new Error("Config validation error: features.debug_mode_default must be boolean");
  }
  if (typeof config.features.auth_enabled !== "boolean") {
    throw new Error("Config validation error: features.auth_enabled must be boolean");
  }
  if (typeof config.features.mcp_apps_enabled !== "boolean") {
    throw new Error("Config validation error: features.mcp_apps_enabled must be boolean");
  }

  // Agent config validation
  if (config.agent.endpoint && !isValidUrl(config.agent.endpoint)) {
    throw new Error(
      `Config validation error: agent.endpoint must be a valid URL (got '${config.agent.endpoint}')`,
    );
  }
  if (typeof config.agent.timeout_ms !== "number" || config.agent.timeout_ms <= 0) {
    throw new Error("Config validation error: agent.timeout_ms must be a positive number");
  }
  if (typeof config.agent.streaming !== "boolean") {
    throw new Error("Config validation error: agent.streaming must be boolean");
  }

  // Auth config validation
  if (config.auth.enabled) {
    if (config.auth.sso_issuer_host && !isValidUrl(config.auth.sso_issuer_host)) {
      throw new Error(
        `Config validation error: auth.sso_issuer_host must be a valid URL (got '${config.auth.sso_issuer_host}')`,
      );
    }
    if (config.auth.sso_callback_url && !isValidUrl(config.auth.sso_callback_url)) {
      throw new Error(
        `Config validation error: auth.sso_callback_url must be a valid URL (got '${config.auth.sso_callback_url}')`,
      );
    }
  }

  // Security config validation
  if (config.security.rate_limit.enabled) {
    if (typeof config.security.rate_limit.max !== "number" || config.security.rate_limit.max <= 0) {
      throw new Error("Config validation error: security.rate_limit.max must be a positive number");
    }
    if (!config.security.rate_limit.window || config.security.rate_limit.window.trim() === "") {
      throw new Error("Config validation error: security.rate_limit.window is required");
    }
  }
  if (typeof config.security.session.max_age_days !== "number" || config.security.session.max_age_days <= 0) {
    throw new Error("Config validation error: security.session.max_age_days must be a positive number");
  }

  // Server config validation
  if (typeof config.server.port !== "number" || config.server.port <= 0 || config.server.port > 65535) {
    throw new Error("Config validation error: server.port must be between 1 and 65535");
  }
}

function applyEnvOverrides(config: UISettings): void {
  // Branding overrides
  if (process.env.BRANDING_TITLE) {
    config.branding.title = process.env.BRANDING_TITLE;
  }
  if (process.env.BRANDING_LOGO_URL) {
    config.branding.logo_url = process.env.BRANDING_LOGO_URL;
  }
  if (process.env.BRANDING_FAVICON_URL) {
    config.branding.favicon_url = process.env.BRANDING_FAVICON_URL;
  }

  // Branding color overrides (light theme)
  if (!config.branding.colors) config.branding.colors = (DEFAULTS.branding.colors as typeof config.branding.colors);
  if (!config.branding.colors.light) config.branding.colors.light = { ...DEFAULTS.branding.colors.light };
  if (!config.branding.colors.dark) config.branding.colors.dark = { ...DEFAULTS.branding.colors.dark };
  if (process.env.BRANDING_PRIMARY_LIGHT) config.branding.colors.light.primary = process.env.BRANDING_PRIMARY_LIGHT;
  if (process.env.BRANDING_ACCENT_LIGHT) config.branding.colors.light.accent = process.env.BRANDING_ACCENT_LIGHT;
  if (process.env.BRANDING_BG_LIGHT) config.branding.colors.light.background = process.env.BRANDING_BG_LIGHT;
  if (process.env.BRANDING_FG_LIGHT) config.branding.colors.light.foreground = process.env.BRANDING_FG_LIGHT;
  if (process.env.BRANDING_PRIMARY_DARK) config.branding.colors.dark.primary = process.env.BRANDING_PRIMARY_DARK;
  if (process.env.BRANDING_ACCENT_DARK) config.branding.colors.dark.accent = process.env.BRANDING_ACCENT_DARK;
  if (process.env.BRANDING_BG_DARK) config.branding.colors.dark.background = process.env.BRANDING_BG_DARK;
  if (process.env.BRANDING_FG_DARK) config.branding.colors.dark.foreground = process.env.BRANDING_FG_DARK;

  // Feature overrides — support both new FEATURE_AUTH_ENABLED and legacy AUTH_ENABLED
  if (process.env.FEATURE_AUTH_ENABLED !== undefined) {
    config.features.auth_enabled = process.env.FEATURE_AUTH_ENABLED === "true";
  } else if (process.env.AUTH_ENABLED !== undefined) {
    config.features.auth_enabled = process.env.AUTH_ENABLED === "true";
  }
  if (process.env.FEATURE_DEBUG_MODE_DEFAULT !== undefined) {
    config.features.debug_mode_default = process.env.FEATURE_DEBUG_MODE_DEFAULT === "true";
  }
  if (process.env.MCP_DCR_ENABLED !== undefined) {
    config.features.mcp_dcr_enabled = process.env.MCP_DCR_ENABLED === "true";
  }
  if (process.env.FEATURE_MCP_APPS_ENABLED !== undefined) {
    config.features.mcp_apps_enabled = process.env.FEATURE_MCP_APPS_ENABLED === "true";
  }
  // Agent overrides
  if (process.env.AGENT_ENDPOINT) {
    config.agent.endpoint = process.env.AGENT_ENDPOINT;
  }
  if (process.env.AGENT_TIMEOUT_MS) {
    const timeout = Number.parseInt(process.env.AGENT_TIMEOUT_MS, 10);
    if (!Number.isNaN(timeout)) {
      config.agent.timeout_ms = timeout;
    }
  }

  // Auth overrides - ALL SSO config comes from environment variables (never from YAML)
  // These are injected by agent-engine during deployment
  if (process.env.SSO_CLIENT_ID) {
    config.auth.sso_client_id = process.env.SSO_CLIENT_ID;
  }
  if (process.env.SSO_CLIENT_SECRET) {
    config.auth.sso_client_secret = process.env.SSO_CLIENT_SECRET;
  }
  if (process.env.SSO_ISSUER_HOST) {
    config.auth.sso_issuer_host = process.env.SSO_ISSUER_HOST;
  }
  if (process.env.SSO_CALLBACK_URL) {
    config.auth.sso_callback_url = process.env.SSO_CALLBACK_URL;
  }

  // Security overrides - Session
  if (process.env.SESSION_SECURE_COOKIE !== undefined) {
    config.security.session.secure_cookie = process.env.SESSION_SECURE_COOKIE === 'true';
  }
  if (process.env.SECURITY_SESSION_SECURE_COOKIE !== undefined) {
    config.security.session.secure_cookie = process.env.SECURITY_SESSION_SECURE_COOKIE === "true";
  }
  if (process.env.SESSION_HTTP_ONLY !== undefined) {
    config.security.session.http_only = process.env.SESSION_HTTP_ONLY === 'true';
  }
  if (process.env.SESSION_SAME_SITE) {
    const sameSite = process.env.SESSION_SAME_SITE.toLowerCase();
    if (['strict', 'lax', 'none'].includes(sameSite)) {
      config.security.session.same_site = sameSite as 'strict' | 'lax' | 'none';
    }
  }
  
  // Platform OPA overrides
  if (process.env.PLATFORM_OPA_ENABLED !== undefined) {
    config.platform.opa.enabled = process.env.PLATFORM_OPA_ENABLED === "true";
  }
  if (process.env.PLATFORM_OPA_POLICY_PATH) {
    config.platform.opa.policy_path = process.env.PLATFORM_OPA_POLICY_PATH;
  }
  if (process.env.PLATFORM_OPA_FAIL_ON_VIOLATION !== undefined) {
    config.platform.opa.fail_on_violation = process.env.PLATFORM_OPA_FAIL_ON_VIOLATION === "true";
  }
  if (process.env.SECURITY_SESSION_MAX_AGE_DAYS) {
    const days = Number.parseInt(process.env.SECURITY_SESSION_MAX_AGE_DAYS, 10);
    if (!Number.isNaN(days)) {
      config.security.session.max_age_days = days;
    }
  }

  // Security overrides - CSP (for emergency rollback)
  if (process.env.CSP_SCRIPT_SRC) {
    config.security.helmet.csp.script_src = process.env.CSP_SCRIPT_SRC.split(' ');
  }
  if (process.env.CSP_CONNECT_SRC) {
    config.security.helmet.csp.connect_src = process.env.CSP_CONNECT_SRC.split(' ');
  }
  if (process.env.CSP_FRAME_SRC) {
    config.security.helmet.csp.frame_src = process.env.CSP_FRAME_SRC.split(' ');
  }

  // Security overrides - Rate limit
  if (process.env.RATE_LIMIT_MAX) {
    const max = Number.parseInt(process.env.RATE_LIMIT_MAX, 10);
    if (!Number.isNaN(max)) {
      config.security.rate_limit.max = max;
    }
  }
  if (process.env.SECURITY_RATE_LIMIT_MAX) {
    const max = Number.parseInt(process.env.SECURITY_RATE_LIMIT_MAX, 10);
    if (!Number.isNaN(max)) {
      config.security.rate_limit.max = max;
    }
  }
  if (process.env.SECURITY_RATE_LIMIT_WINDOW) {
    config.security.rate_limit.window = process.env.SECURITY_RATE_LIMIT_WINDOW;
  }

  // Server overrides
  if (process.env.PORT) {
    const port = Number.parseInt(process.env.PORT, 10);
    if (!Number.isNaN(port)) {
      config.server.port = port;
    }
  }

  // Logging override
  if (process.env.LOG_LEVEL) {
    config.logging.level = process.env.LOG_LEVEL;
  }
}

let _settings: UISettings | undefined;
let _agentName: string | null = null;

export function getSettings(): UISettings {
  if (_settings) return _settings;

  const explicitPath = process.env.UI_CONFIG_PATH;
  const configPath =
    explicitPath ||
    resolve(__dirname, "../../../config/ui/settings.yaml");

  if (explicitPath && !existsSync(configPath)) {
    throw new Error(
      `Config file not found: ${configPath}. Mount config/ui at /opt/app-root/src/config`,
    );
  }

  const fromFile = loadYaml(configPath);

  // Deep merge defaults with file config
  _settings = fromFile
    ? deepMerge(DEFAULTS as unknown as Record<string, unknown>, fromFile) as unknown as UISettings
    : { ...DEFAULTS };

  // Apply environment variable overrides
  applyEnvOverrides(_settings);

  // Backfill keys added after older config files were written
  if (!_settings.security.helmet.csp.frame_src?.length) {
    _settings.security.helmet.csp.frame_src = [...DEFAULTS.security.helmet.csp.frame_src];
  }

  // Validate the final config
  validateConfig(_settings);

  // Warn if production environment has insecure session cookies
  const isProd = process.env.ENVIRONMENT === 'production';
  if (isProd && !_settings.security.session.secure_cookie) {
    console.warn(
      'WARNING: Running in production with secure_cookie=false. ' +
      'Session cookies will be transmitted over HTTP. ' +
      'Set SESSION_SECURE_COOKIE=true or update config file.'
    );
  }

  return _settings;
}

// For testing only - clears the cached settings and agent name
export function resetSettings(): void {
  _settings = undefined;
  _agentName = null;
}

export async function getAgentName(): Promise<string> {
  if (_agentName !== null) return _agentName;

  const cfg = getSettings();
  const agentHost = cfg.agent.endpoint || process.env.AGENT_HOST || "http://localhost:5002";

  try {
    const resp = await fetch(`${agentHost}/info`, { signal: AbortSignal.timeout(3000) });
    if (resp.ok) {
      const data = await resp.json() as { name?: string };
      _agentName = data.name || "Agent";
    } else {
      _agentName = "Agent";
    }
  } catch {
    _agentName = "Agent";
  }
  return _agentName;
}
