# OPA Compliance Policies

This directory contains Open Policy Agent (OPA) policies that are evaluated at server startup (and on every hot-reload) to validate the runtime configuration.

OPA is **optional and disabled by default**. Enable it in `config/ui/settings.yaml`:

```yaml
platform:
  opa:
    enabled: true
    policy_path: "config/compliance"   # path to this directory
    fail_on_violation: false           # set to true to block startup on violations
```

---

## How it works

1. At startup the Fastify server registers `opa.plugin.ts`.
2. The plugin compiles all `.rego` files in `policy_path` into a WASM bundle using the `opa` CLI.
3. The current `UISettings` object is passed as `input` to `compliance/ui/deny`.
4. Any non-empty `deny` set produces `PolicyViolation` messages that are logged.
5. If `fail_on_violation: true` and violations exist, the server throws and exits.
6. The policy directory is watched — changing a `.rego` or `.json` file triggers an automatic recompile (500 ms debounce).

### Prerequisite

The `opa` binary must be on `$PATH`:

```bash
# macOS
brew install opa

# Linux (x86_64)
curl -sLo /usr/local/bin/opa https://openpolicyagent.org/downloads/latest/opa_linux_amd64_static
chmod +x /usr/local/bin/opa

# Verify
opa version
```

---

## Built-in rules (`policy.rego`)

The default policy ships with six deny rules. Each rule corresponds to a `platform.opa.*` setting:

| Rule | Triggered when | Controlled by |
|---|---|---|
| **auth_provider** | `auth_enabled=true` and `SSO_AUTH_PROVIDER` not in `approved_auth_providers` | `platform.opa.approved_auth_providers` |
| **agent_endpoint** | `agent.endpoint` does not end with any approved suffix | `platform.opa.internal_endpoint_suffixes` |
| **session_ttl** | `security.session.max_age_days` exceeds the configured maximum | `platform.opa.max_session_ttl_days` |
| **debug_mode** | `features.debug_mode_default=true` and `restrict_debug_mode=true` | `platform.opa.restrict_debug_mode` |
| **restricted_features** | A feature key listed in `restricted_features` is `true` | `platform.opa.restricted_features` |
| **rate_limit** | `security.rate_limit.max` exceeds the policy cap | `platform.opa.max_rate_limit` |

### Example: enforce internal-only agent endpoints

```yaml
# settings.yaml
platform:
  opa:
    enabled: true
    fail_on_violation: true
    internal_endpoint_suffixes:
      - ".svc.cluster.local"
      - ".internal.example.com"
```

If `agent.endpoint` is `https://public-api.example.com/agent`, the server logs:

```text
OPA policy violation: agent endpoint 'https://public-api.example.com/agent'
  does not match any approved internal suffix [".svc.cluster.local", ".internal.example.com"]
```

### Example: cap session lifetime and restrict debug mode

```yaml
platform:
  opa:
    enabled: true
    fail_on_violation: true
    max_session_ttl_days: 7
    restrict_debug_mode: true
```

Attempting to deploy `security.session.max_age_days: 30` or `features.debug_mode_default: true` will block startup.

### Example: restrict to approved auth providers

```yaml
platform:
  opa:
    enabled: true
    approved_auth_providers:
      - "oidc"
```

Set `SSO_AUTH_PROVIDER=saml` in env and the server will log a violation (SAML is not in the approved list).

---

## `data.json`

`data.json` provides static external data that OPA policies can reference via `data.*`. It is currently a placeholder. You can extend it with environment-specific constants:

```json
{
  "approved_auth_providers": ["oidc"],
  "internal_endpoint_suffixes": [".svc.cluster.local"],
  "max_session_ttl_days": 7
}
```

Policies can then reference `data.approved_auth_providers` instead of hard-coding values in `settings.yaml`.

---

## Writing custom rules

All custom rules must live in `package compliance.ui` and produce string messages via `deny contains msg if { ... }`.

**Template:**

```rego
package compliance.ui

import rego.v1

# Deny startup if a custom condition is violated.
deny contains msg if {
    # Access the full UISettings object via `input`
    input.features.some_flag
    not condition_is_satisfied
    msg := "explanation of the violation"
}
```

**Available `input` fields:**

```text
input.branding          — BrandingConfig
input.features          — FeaturesConfig
input.agent             — AgentConfig  (endpoint, timeout_ms, streaming)
input.security          — SecurityConfig (rate_limit, session, helmet)
input.auth_provider     — string (value of SSO_AUTH_PROVIDER env var, default "oidc")
input.platform.opa      — PlatformOpaConfig
```

**Test your policy locally before deploying:**

```bash
# Evaluate the deny rule against a sample input
opa eval \
  --data config/compliance \
  --input <(echo '{
    "features": {"auth_enabled": true, "debug_mode_default": false},
    "agent": {"endpoint": "https://public.example.com"},
    "security": {"session": {"max_age_days": 30}, "rate_limit": {"max": 100}},
    "auth_provider": "oidc",
    "platform": {"opa": {
      "approved_auth_providers": ["oidc"],
      "internal_endpoint_suffixes": [".svc.cluster.local"],
      "max_session_ttl_days": 7,
      "restrict_debug_mode": true,
      "restricted_features": [],
      "max_rate_limit": 500
    }}
  }') \
  "data.compliance.ui.deny"
```

---

## File structure

```text
config/compliance/
├── policy.rego     # Deny rules (package compliance.ui)
├── data.json       # Static external data available as data.* in Rego
└── README.md       # This file
```

Additional `.rego` files placed here are automatically compiled into the same bundle.
