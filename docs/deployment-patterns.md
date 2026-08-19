# Template UI — Deployment Patterns

This guide covers five customization areas a developer needs to understand before deploying or forking template-ui:

1. [Branding Customization](#1-branding-customization)
2. [Feature Flag Reference](#2-feature-flag-reference)
3. [Runtime Config Examples](#3-runtime-config-examples)
4. [Agent Endpoint Switching](#4-agent-endpoint-switching)
5. [OPA Policy Examples](#5-opa-policy-examples)

For the full config schema with every key and its env-var override, see [`config/ui/README.md`](../config/ui/README.md).

---

## 1. Branding Customization

Branding is controlled entirely through `config/ui/settings.yaml` (or environment variables) — no code changes or rebuilds are needed.

### What you can customize

| Property | YAML key | Effect |
|---|---|---|
| App title | `branding.title` | Browser tab and masthead heading |
| Logo | `branding.logo_url` | Path or URL of the logo image |
| Favicon | `branding.favicon_url` | Browser favicon (defaults to `logo_url` if omitted) |
| Light theme colors | `branding.colors.light.*` | Applied when the user's system is in light mode |
| Dark theme colors | `branding.colors.dark.*` | Applied when the user's system is in dark mode |

Each theme has four color tokens: `primary`, `accent`, `background`, `foreground`. All must be valid 6-digit hex values (`#rrggbb`). The server validates them at startup.

### Step-by-step: change the app title and logo

1. **Prepare your logo.** Place it in `public/` so the Fastify static file handler serves it. For example: `public/my-logo.svg`.

2. **Edit `config/ui/settings.yaml`:**

```yaml
branding:
  title: "Inventory Assistant"
  logo_url: "/my-logo.svg"
  favicon_url: "/my-logo.svg"
```

3. **Save and refresh the browser** (branding is hot-reloaded; for logo changes the file is served immediately but the browser may cache the old one).

4. **Verify** by opening the app — the tab title and masthead should reflect the new values.

### Step-by-step: apply a custom color theme

```yaml
branding:
  title: "My Agent"
  colors:
    light:
      primary: "#6200ee"   # Deep Purple
      accent: "#018786"    # Teal
      background: "#ffffff"
      foreground: "#121212"
    dark:
      primary: "#bb86fc"
      accent: "#03dac6"
      background: "#121212"
      foreground: "#e1e1e1"
```

Colors are hot-reloaded — save the file and the server logs `Settings applied without restart: branding (colors, title, logo)`. Refresh the browser.

### Overriding via environment variables

Every branding key can be set via env vars (takes precedence over the YAML file):

```bash
BRANDING_TITLE="My Agent"
BRANDING_LOGO_URL="/my-logo.svg"
BRANDING_PRIMARY_LIGHT="#6200ee"
BRANDING_ACCENT_LIGHT="#018786"
BRANDING_BG_LIGHT="#ffffff"
BRANDING_FG_LIGHT="#121212"
BRANDING_PRIMARY_DARK="#bb86fc"
BRANDING_ACCENT_DARK="#03dac6"
BRANDING_BG_DARK="#121212"
BRANDING_FG_DARK="#e1e1e1"
```

This is the recommended approach in Kubernetes: inject `BRANDING_TITLE` from a ConfigMap so multiple deployments can share the same image.

### Ready-to-use examples

| File | Description |
|---|---|
| [`config/ui/examples/blue-theme.yaml`](../config/ui/examples/blue-theme.yaml) | IBM Blue color scheme |
| [`config/ui/examples/red-hat-branding.yaml`](../config/ui/examples/red-hat-branding.yaml) | Red Hat color palette and logo |

---

## 2. Feature Flag Reference

Feature flags are boolean values in the `features` block. They control which capabilities are active and what defaults users see.

### Flag reference

| Flag | Type | Default | Env override | OPA-enforceable | Description |
|---|---|---|---|---|---|
| `features.auth_enabled` | `bool` | `true` | `FEATURE_AUTH_ENABLED` (or legacy `AUTH_ENABLED`) | `restricted_features`, `approved_auth_providers` | When `false`, bypasses SSO entirely and injects a dummy user (`developer@redhat.com`). Environment variables override the YAML value — set via env var during deployment. |
| `features.debug_mode_default` | `bool` | `false` | `FEATURE_DEBUG_MODE_DEFAULT` | `restrict_debug_mode: true` | Default open/closed state of the debug panel. Users can toggle it. Never enable in production — OPA can enforce this. |
| `features.mcp_apps_enabled` | `bool` | `true` | `FEATURE_MCP_APPS_ENABLED` | — | When `true`, serves `/sandbox_proxy.html` and renders MCP Apps in chat. Independent of chat SSO. |


### Precedence

```text
FEATURE_AUTH_ENABLED env var
  > AUTH_ENABLED env var (legacy)
    > features.auth_enabled in settings.yaml
      > built-in default (true)
```

### When to use each flag

**`auth_enabled: false`** — local development only. Skips the SSO plugin registration entirely. The dummy user is always `developer@redhat.com`. `SSO_CLIENT_ID` and `SSO_CLIENT_SECRET` are not required, but `COOKIE_SIGN` is still needed for session signing.

**`debug_mode_default: true`** — useful when iterating on agent responses locally to see raw tool calls and streaming chunks. Should always be `false` in production (OPA `restrict_debug_mode: true` enforces this).

### Protecting flags with OPA

To prevent `debug_mode_default` from being accidentally enabled in production:

```yaml
platform:
  opa:
    enabled: true
    fail_on_violation: true
    restrict_debug_mode: true
```

To lock down a custom feature flag (e.g., `memory_enabled`):

```yaml
platform:
  opa:
    restricted_features:
      - "memory_enabled"
```

Any `settings.yaml` or env var that sets `features.memory_enabled: true` will be blocked at startup.

---

## 3. Runtime Config Examples

### Local development

Minimal setup — auth off, debug on, longer timeout. Copy to `config/ui/settings.yaml`:

```yaml
branding:
  title: "Local Dev Agent"

features:
  auth_enabled: false
  debug_mode_default: true

agent:
  timeout_ms: 60000

security:
  rate_limit:
    enabled: false
  session:
    secure_cookie: false

logging:
  level: "debug"
```

Or use the ready-made file: `cp config/ui/examples/minimal.yaml config/ui/settings.yaml`

### Kind cluster (internal CI)

Auth off, agent resolves via in-cluster DNS, rate-limit enabled:

```yaml
branding:
  title: "CI Agent"

features:
  auth_enabled: false

agent:
  timeout_ms: 30000
```

Set `AGENT_HOST=http://template-agent.default.svc.cluster.local:8082` in the Kind ConfigMap for env-driven config.

### Production (OpenShift)

Full example at [`config/ui/examples/production.yaml`](../config/ui/examples/production.yaml). Key points:

- SSO credentials injected exclusively from environment variables (never in YAML)
- `secure_cookie: true` — HTTPS only
- OPA enabled with `fail_on_violation: true`
- `logging.level: "warn"` to reduce log volume

The OpenShift deployment manifests at `deployment/openshift/` are pre-wired to inject all required env vars from a ConfigMap and Secret. Fill in `deployment/openshift/configmap.yaml` and `deployment/openshift/secret.yaml`, then apply:

```bash
kubectl apply -k deployment/openshift/
```

### Multi-agent deployment

Two copies of template-ui pointing at different agent engines. Use environment variables so both copies share the same image:

```bash
# Agent A
export BRANDING_TITLE="Code Review Agent"  AGENT_ENDPOINT=http://code-review-agent:8082

# Agent B
export BRANDING_TITLE="Data Assistant"     AGENT_ENDPOINT=http://data-agent:8082
```

No `settings.yaml` file is needed — env vars alone are sufficient.

### Hot-reload reference

The config file is watched for changes. Which settings apply live vs. need a restart:

| Setting | Hot-reloaded? | Notes |
|---|---|---|
| `branding.*` | **Yes** | Logged as `branding (colors, title, logo)` |
| `agent.endpoint` | **Yes** | Logged as `agent.endpoint: old → new` |
| `agent.timeout_ms` | **Yes** | Logged as `agent.timeout_ms: old → new` |
| `security.rate_limit.*` | No | Logged as warning: restart required |
| `security.session.*` | No | Logged as warning: restart required |
| `security.helmet.enabled` | No | Logged as warning: restart required |
| `platform.opa.*` | No | OPA plugin registered at startup only |

---

## 4. Agent Endpoint Switching

The BFF proxy (`src/server/router/proxy.router.ts`) resolves the agent host with this priority order:

```text
agent.endpoint in settings.yaml
  >  AGENT_ENDPOINT env var
    >  AGENT_HOST env var
      >  http://localhost:5002 (hardcoded fallback)
```

### Setting the endpoint in YAML

```yaml
agent:
  endpoint: "http://my-agent-engine:8082"
  timeout_ms: 30000
```

`agent.endpoint` is hot-reloaded — update the file and the next request uses the new host without a restart.

### Setting the endpoint via environment variable

```bash
# In a .env file or shell
export AGENT_ENDPOINT=https://prod-agent.example.com
```

`AGENT_ENDPOINT` takes precedence over `AGENT_HOST`. Use `AGENT_HOST` when you want to keep the legacy variable name (e.g., existing Helm values).

### Kubernetes ConfigMap pattern

The OpenShift ConfigMap at `deployment/openshift/configmap.yaml` currently uses `AGENT_HOST`:

```yaml
data:
  AGENT_HOST: "http://template-agent:8081"
```

To switch to a different agent without touching the YAML:

```bash
kubectl patch configmap template-ui-config \
  --type merge \
  -p '{"data": {"AGENT_HOST": "http://new-agent:8082"}}'
kubectl rollout restart deployment/template-ui
```

Or use `AGENT_ENDPOINT` in the ConfigMap to take higher precedence over `AGENT_HOST` if both are set:

```yaml
data:
  AGENT_HOST: "http://default-agent:8081"     # low-priority fallback
  AGENT_ENDPOINT: "http://specific-agent:8082" # high-priority override
```

### Verifying connectivity

After switching the endpoint, hit the health probe to confirm reachability:

```bash
curl http://localhost:8080/api/health/agent
# → {"status":"healthy","statusCode":200,"timestamp":"..."}
# → {"status":"unreachable","timestamp":"..."} if the agent is down
```

### Timeout tuning

Default timeout is 30 s. For agents with long reasoning chains, increase it:

```yaml
agent:
  timeout_ms: 120000   # 2 minutes
```

Or at runtime via `AGENT_TIMEOUT_MS=120000`. The timeout applies to both the streaming endpoint and all passthrough proxy calls.

### Streaming vs. polling

```yaml
agent:
  streaming: true   # default — enables SSE via POST /api/proxy/agent/v1/stream
```

When `streaming: true`, the BFF translates LangGraph Platform SSE events into the simplified chunk format the frontend expects. Disable only if your agent engine does not support SSE.

---

## 5. OPA Policy Examples

OPA (Open Policy Agent) runs at startup to validate the full configuration against your compliance rules. It is **disabled by default** and requires the `opa` CLI on `$PATH`.

See [`config/compliance/README.md`](../config/compliance/README.md) for installation instructions and how to write custom rules.

### Enabling OPA

Minimum viable OPA config (warn-only mode):

```yaml
platform:
  opa:
    enabled: true
    policy_path: "config/compliance"
    fail_on_violation: false   # log violations but don't block startup
```

With `fail_on_violation: false` the server starts regardless of violations. Violations are logged as warnings:

```text
[warn] OPA policy violation: debug_mode_default cannot be enabled in this environment
```

Switch to `fail_on_violation: true` when you want the server to refuse to start on any violation — recommended for production.

### Example 1: Restrict auth providers

Allow only OIDC in production; block SAML or custom providers:

```yaml
platform:
  opa:
    enabled: true
    fail_on_violation: true
    approved_auth_providers:
      - "oidc"
```

The `SSO_AUTH_PROVIDER` env var determines the provider (defaults to `"oidc"`). If it is set to anything not in `approved_auth_providers`, startup fails:

```text
OPA policy violation: auth provider 'saml' is not in the approved list ["oidc"]
```

### Example 2: Enforce internal-only agent endpoints

Prevent the UI from being pointed at public internet endpoints:

```yaml
platform:
  opa:
    enabled: true
    fail_on_violation: true
    internal_endpoint_suffixes:
      - ".svc.cluster.local"
      - ".internal.example.com"
```

Any `agent.endpoint` that does not end with one of these suffixes triggers a violation. An empty `agent.endpoint` (falling back to `AGENT_HOST`) is allowed.

```text
OPA policy violation: agent endpoint 'https://public-api.example.com'
  does not match any approved internal suffix [".svc.cluster.local", ".internal.example.com"]
```

### Example 3: Enforce session TTL and ban debug mode in production

```yaml
platform:
  opa:
    enabled: true
    fail_on_violation: true
    max_session_ttl_days: 7      # security.session.max_age_days must be <= 7
    restrict_debug_mode: true    # features.debug_mode_default must be false
```

If a developer accidentally commits `features.debug_mode_default: true` or `security.session.max_age_days: 30` to the production config, the deployment fails before traffic reaches it.

### Example 4: Rate-limit cap

Ensure no deployment can disable rate-limiting or set an excessively permissive limit:

```yaml
platform:
  opa:
    enabled: true
    max_rate_limit: 500   # security.rate_limit.max must be <= 500
```

### Example 5: Full production OPA config

This is included in [`config/ui/examples/production.yaml`](../config/ui/examples/production.yaml):

```yaml
platform:
  opa:
    enabled: true
    policy_path: "config/compliance"
    fail_on_violation: true
    approved_auth_providers:
      - "oidc"
    internal_endpoint_suffixes:
      - ".svc.cluster.local"
      - ".internal.example.com"
    max_session_ttl_days: 7
    restrict_debug_mode: true
    restricted_features: []
    max_rate_limit: 500
```

### Writing a custom rule

Add a new `.rego` file to `config/compliance/`. The engine auto-recompiles on file change.

**Example: deny startup if the title contains "Test":**

```rego
# config/compliance/no-test-title.rego
package compliance.ui

import rego.v1

deny contains msg if {
    contains(lower(input.branding.title), "test")
    msg := sprintf("branding.title '%s' must not contain 'test' in production", [input.branding.title])
}
```

Test locally before deploying:

```bash
opa eval \
  --data config/compliance/ \
  --input <(echo '{"branding":{"title":"Test Agent"},"features":{},"agent":{},"security":{"session":{"max_age_days":7},"rate_limit":{"max":100}},"auth_provider":"oidc","platform":{"opa":{"approved_auth_providers":[],"internal_endpoint_suffixes":[],"max_session_ttl_days":0,"restrict_debug_mode":false,"restricted_features":[],"max_rate_limit":0}}}') \
  "data.compliance.ui.deny"
```

Expected output:

```json
{
  "result": [
    {
      "expressions": [
        {
          "value": ["branding.title 'Test Agent' must not contain 'test' in production"],
          ...
        }
      ]
    }
  ]
}
```

---

## Summary

| Topic | Where to start |
|---|---|
| Branding | `config/ui/examples/blue-theme.yaml` or `red-hat-branding.yaml` |
| Feature flags | `config/ui/examples/minimal.yaml` (dev) |
| Full runtime config | `config/ui/examples/production.yaml` |
| Agent endpoint | `AGENT_ENDPOINT` env var or `agent.endpoint` in settings.yaml |
| OPA policies | `config/compliance/README.md` + `config/ui/examples/production.yaml` |
