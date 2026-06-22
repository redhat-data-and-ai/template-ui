# Template UI Configuration

Drop a `settings.yaml` file in this directory to configure branding, features, and agent settings without code changes.

The file is optional — if absent, the server uses built-in defaults.

## Schema

```yaml
branding:
  logo_url: "/custom-logo.svg"     # Path or URL to logo image
  title: "My Agent"                # App title (browser tab + masthead)
  favicon_url: "/favicon.ico"      # Optional favicon (defaults to logo_url if not set)
  colors:
    light:
      primary: "#0066cc"
      accent: "#a60000"
      background: "#ffffff"
      foreground: "#1a1a1a"
    dark:
      primary: "#4dabf7"
      accent: "#f56e6e"
      background: "#0a1628"
      foreground: "#f0f4f8"

features:
  debug_mode_default: false        # Default for debug mode toggle (users can override)
  auth_enabled: true               # Enable/disable authentication

agent:
  endpoint: ""                     # Agent API URL (empty = use AGENT_HOST env var)
  timeout_ms: 30000
  streaming: true
```

## Alternative: environment variables

All values can be set via env vars instead, which take precedence over this file. See `env.template` for the full list.
