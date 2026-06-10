import { readFileSync } from "node:fs";
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

export interface UISettings {
  server: ServerConfig;
  logging: LoggingConfig;
  cors: CorsConfig;
  security: SecurityConfig;
  otel: OtelConfig;
  announcement: AnnouncementConfig;
}

const DEFAULTS: UISettings = {
  server: { host: "0.0.0.0", port: 8080, body_limit: 1_048_576 },
  logging: { level: "info" },
  cors: { origin: "http://localhost:5173" },
  security: {
    helmet: {
      enabled: true,
      csp: {
        default_src: ["'self'"],
        script_src: ["'self'", "'unsafe-inline'"],
        style_src: ["'self'", "'unsafe-inline'"],
        img_src: ["'self'", "data:", "blob:"],
        connect_src: ["'self'"],
        font_src: ["'self'", "data:"],
        object_src: ["'none'"],
        frame_ancestors: ["'none'"],
      },
      cross_origin_embedder_policy: false,
    },
    rate_limit: {
      enabled: true,
      max: 100,
      window: "1 minute",
      exclude_paths: ["/api/health", "/_health"],
    },
    session: { secure_cookie: false, max_age_days: 30 },
  },
  otel: { enabled: false, service_name: "template-ui" },
  announcement: { enabled: false, message: "", type: "info" },
};

function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const result = { ...base } as Record<string, unknown>;
  for (const key of Object.keys(override)) {
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
  try {
    const raw = readFileSync(filePath, "utf-8");
    return (yaml.load(raw) as Record<string, unknown>) ?? null;
  } catch {
    return null;
  }
}

let _settings: UISettings | undefined;

export function getSettings(): UISettings {
  if (_settings) return _settings;

  const configPath =
    process.env.UI_CONFIG_PATH ||
    resolve(__dirname, "../../../config/ui/settings.yaml");
  const fromFile = loadYaml(configPath);

  _settings = fromFile
    ? deepMerge(DEFAULTS as unknown as Record<string, unknown>, fromFile) as unknown as UISettings
    : { ...DEFAULTS };

  if (process.env.SSO_ISSUER_HOST) {
    try {
      const ssoOrigin = new URL(process.env.SSO_ISSUER_HOST).origin;
      const connectSrc = _settings.security.helmet.csp.connect_src;
      if (!connectSrc.includes(ssoOrigin)) {
        connectSrc.push(ssoOrigin);
      }
    } catch {
      /* invalid URL — skip */
    }
  }

  return _settings;
}
