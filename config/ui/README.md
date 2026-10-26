# Template UI Configuration Reference

Two files, two concerns:

| File | Covers | Read by |
|---|---|---|
| `settings.yaml` | runtime behaviour — branding, copy, features, security, agent endpoint | the server, at startup |
| `deployment/values.yaml` | how the pod is scheduled — replicas, resources, probes, route, build | `npm run render:deployment`, at build time |

Drop a `settings.yaml` file in this directory to configure branding, features, security, and agent settings without code changes. The file is optional — if absent, built-in defaults are used.

For worked examples and deployment patterns see [`docs/deployment-patterns.md`](../../docs/deployment-patterns.md).

---

## Config loading order

Settings are resolved in this priority order (highest wins):

```
Environment variables  >  settings.yaml  >  Built-in defaults
```

The config file path can be overridden with `UI_CONFIG_PATH=<absolute-or-relative-path>`.

---

## Full schema reference

### `branding`

Controls the visual identity of the application. Changes apply **without a server restart** (hot-reloaded by the config watcher).

```yaml
branding:
  title: "Deep Agent"                        # Browser tab title and masthead heading
  logo_url: "/dist/frontend/redhat-logo.svg" # Path or URL served by the server
  favicon_url: "/dist/frontend/redhat-logo.svg"
  colors:
    light:
      primary: "#0066cc"    # Primary action color (buttons, links)
      accent: "#a60000"     # Accent / highlight color
      background: "#ffffff" # Page background
      foreground: "#1a1a1a" # Default text color
    dark:
      primary: "#4dabf7"
      accent: "#f56e6e"
      background: "#0a1628"
      foreground: "#f0f4f8"
```

**Color values must be 6-digit hex** (`#rrggbb`). The server validates colors at startup and fails with a clear error on malformed values.

**Environment variable overrides:**

| Env var | YAML key |
|---|---|
| `BRANDING_TITLE` | `branding.title` |
| `BRANDING_LOGO_URL` | `branding.logo_url` |
| `BRANDING_FAVICON_URL` | `branding.favicon_url` |
| `BRANDING_PRIMARY_LIGHT` | `branding.colors.light.primary` |
| `BRANDING_ACCENT_LIGHT` | `branding.colors.light.accent` |
| `BRANDING_BG_LIGHT` | `branding.colors.light.background` |
| `BRANDING_FG_LIGHT` | `branding.colors.light.foreground` |
| `BRANDING_PRIMARY_DARK` | `branding.colors.dark.primary` |
| `BRANDING_ACCENT_DARK` | `branding.colors.dark.accent` |
| `BRANDING_BG_DARK` | `branding.colors.dark.background` |
| `BRANDING_FG_DARK` | `branding.colors.dark.foreground` |

---

### `content`

Every user-facing string on the landing and empty-thread screens. Changing the
product's voice is a config edit, not a React edit.

```yaml
content:
  greeting: "Hey {user}! 👋"           # used when a name is available
  greeting_anonymous: "Hey there! 👋"  # used when it is not
  subtitle: "{agent} is ready to help. What would you like to explore today?"
  quick_prompts_heading: "Let's try some quick prompts 🚀"
  quick_prompts:
    - "What can {agent} do for me?"
    - "Help me analyze a dataset"
  input_placeholder: "Ask {agent} anything..."
  welcome_heading: "Welcome to {agent}!"
  welcome_subtitle: "How can I help you today?"
```

Two tokens are substituted at render time:

| Token | Resolves to |
|---|---|
| `{agent}` | the agent's display name, falling back to `Agent` |
| `{user}` | the signed-in user's display or given name, empty when anonymous |

Two keys control visibility rather than wording:

- `quick_prompts: []` removes the starter buttons entirely.
- `quick_prompts_heading: ""` keeps the buttons but drops the heading above them.

Served at `GET /api/config/content`. No environment-variable overrides —
copy belongs in the file, where it can be reviewed.

---

### `features`

Feature flags that control application behaviour. Some are user-toggleable at runtime; some are enforced by OPA policy.

```yaml
features:
  auth_enabled: true          # Enable SSO/OAuth2 authentication
  debug_mode_default: false   # Default state of the debug panel toggle
  mcp_apps_enabled: true      # Serve sandbox proxy + render MCP Apps in chat
```

**Environment variable overrides:**

| Env var | YAML key | Notes |
|---|---|---|
| `FEATURE_AUTH_ENABLED` | `features.auth_enabled` | Preferred |
| `AUTH_ENABLED` | `features.auth_enabled` | Legacy alias (still supported) |
| `FEATURE_DEBUG_MODE_DEFAULT` | `features.debug_mode_default` | |
| `FEATURE_MCP_APPS_ENABLED` | `features.mcp_apps_enabled` | Independent of chat SSO |

When `auth_enabled: false`, a dummy user (`developer@redhat.com`) is injected automatically. No SSO credentials are required.

When `mcp_apps_enabled: false`, `/sandbox_proxy.html` is not served and interactive MCP Apps are not mounted.

---

### `agent`

Controls how the BFF proxy reaches the agent engine. `agent.endpoint` and `agent.timeout_ms` apply **without a server restart**.

```yaml
agent:
  endpoint: ""        # Full URL of the agent. Empty = fall back to AGENT_HOST env var
  timeout_ms: 30000   # Request timeout in milliseconds (applies to all proxy calls)
  streaming: true     # Enable SSE streaming (recommended)
```

**Agent host resolution order (from `proxy.router.ts`):**

```
agent.endpoint  →  AGENT_HOST env var  →  http://localhost:5002
```

**Environment variable overrides:**

| Env var | YAML key |
|---|---|
| `AGENT_ENDPOINT` | `agent.endpoint` |
| `AGENT_TIMEOUT_MS` | `agent.timeout_ms` |

---

### `quick_prompts`

Starting questions shown on the agent chat home page. A non-empty list replaces the built-in prompts. Omit the key, or leave it as an empty list, and the UI keeps the four built-in prompts.

```yaml
quick_prompts:
  - "What is our refund policy?"
  - "Summarize the latest incident"
```

Each entry must be a non-empty string. The server validates the list at startup. A refresh after the file changes is enough; the next page load reads the updated list.

---

### `security`

Security hardening. Changes to `rate_limit`, `session`, and `helmet` require a **server restart** to take effect.

```yaml
security:
  rate_limit:
    enabled: true
    max: 100              # Max requests per window per IP
    window: "1 minute"    # Time window (e.g. "30 seconds", "5 minutes")
    exclude_paths:
      - "/api/health"
      - "/_health"

  session:
    secure_cookie: false  # Set to true in production (HTTPS only)
    max_age_days: 30
    http_only: true
    same_site: "lax"      # "strict" | "lax" | "none"

  helmet:
    enabled: true
    cross_origin_embedder_policy: false
```

**Environment variable overrides:**

| Env var | YAML key |
|---|---|
| `RATE_LIMIT_MAX` / `SECURITY_RATE_LIMIT_MAX` | `security.rate_limit.max` |
| `SECURITY_RATE_LIMIT_WINDOW` | `security.rate_limit.window` |
| `SECURITY_RATE_LIMIT_TRUST_PROXY` | `security.rate_limit.trust_proxy` (hops; `0` trusts none) |
| `SESSION_SECURE_COOKIE` / `SECURITY_SESSION_SECURE_COOKIE` | `security.session.secure_cookie` |
| `SESSION_HTTP_ONLY` | `security.session.http_only` |
| `SESSION_SAME_SITE` | `security.session.same_site` |
| `SECURITY_SESSION_MAX_AGE_DAYS` | `security.session.max_age_days` |
| `CSP_SCRIPT_SRC` | `security.helmet.csp.script_src` (space-separated) |
| `CSP_CONNECT_SRC` | `security.helmet.csp.connect_src` (space-separated) |

---

### `platform`

Platform-level controls. Currently only OPA policy enforcement is configured here.

```yaml
platform:
  opa:
    enabled: false
    policy_path: ""               # Path to .rego directory (default: config/compliance/)
    fail_on_violation: false      # true = block startup on policy violations
    approved_auth_providers: []   # e.g. ["oidc"] — empty = allow all
    internal_endpoint_suffixes: [] # e.g. [".svc.cluster.local"]
    max_session_ttl_days: 0       # 0 = no limit
    restrict_debug_mode: false    # true = deny debug_mode_default=true
    restricted_features: []       # Feature flag keys that must be false
    max_rate_limit: 0             # 0 = no cap
```

**Environment variable overrides:**

| Env var | YAML key |
|---|---|
| `PLATFORM_OPA_ENABLED` | `platform.opa.enabled` |
| `PLATFORM_OPA_POLICY_PATH` | `platform.opa.policy_path` |
| `PLATFORM_OPA_FAIL_ON_VIOLATION` | `platform.opa.fail_on_violation` |

See [`config/compliance/README.md`](../compliance/README.md) for full OPA documentation.

---

### `server`

```yaml
server:
  host: "0.0.0.0"
  port: 8080
  body_limit: 1048576   # Max request body size in bytes (1 MB)
```

**Environment variable overrides:**

| Env var | YAML key |
|---|---|
| `PORT` | `server.port` |

---

### `logging`

```yaml
logging:
  level: "info"   # "debug" | "info" | "warn" | "error"
```

**Environment variable overrides:**

| Env var | YAML key |
|---|---|
| `LOG_LEVEL` | `logging.level` |

---

### `cors`

```yaml
cors:
  origin: "http://localhost:5173"   # Allowed CORS origin for the Vite dev server
```

Set `CORS_ORIGIN` environment variable to override at runtime.

---

## Hot-reload behaviour

The server watches the config file for changes. Not all settings can be applied without a restart:

| Setting area | Hot-reloaded? |
|---|---|
| `branding.*` | Yes |
| `agent.endpoint`, `agent.timeout_ms` | Yes |
| `security.rate_limit.*` | No — restart required |
| `security.session.*` | No — restart required |
| `security.helmet.enabled` | No — restart required |
| `platform.opa.*` | No — restart required |

Changes that require a restart are logged as warnings by the config watcher so you know what to expect.

---

## `deployment/values.yaml`

Replica count, resource requests and limits, probe timings, service and
route settings, and build resources. It mirrors the agent's
`config/agent/deployment/values.yaml`.

It is the source of truth for those values, not a reference copy of them:

```bash
make render-deployment        # regenerate deployment/overlays/*/generated.yaml
make render-deployment-check  # fail if they have drifted (CI)
```

`generated.yaml` is written whole and must not be hand-edited — the check
above exists to catch exactly that. Everything else in an overlay stays
hand-written, because *which* manifests exist is a structural decision, not
a value.

A `targets:` block at the end holds per-overlay overrides, deep-merged over
the shared values:

```yaml
targets:
  kind:
    app:
      replicas: 1   # a laptop cluster does not need HA
```

---

## Example configs

See the `examples/` directory for ready-to-use configurations:

| File | Use case |
|---|---|
| `examples/minimal.yaml` | Local development with auth disabled |
| `examples/blue-theme.yaml` | Blue colour scheme, all other defaults |
| `examples/red-hat-branding.yaml` | Red Hat colour palette and logo |
| `examples/production.yaml` | Production-hardened with OPA enabled |
