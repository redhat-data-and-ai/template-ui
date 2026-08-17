# Template UI

A modern React-based frontend application with Fastify backend for interacting with data through natural language queries via Template Agent. The application features SSO authentication, real-time streaming responses, and a clean chat interface.

## 🚀 Quick Start

### Prerequisites

- **Node.js** >= 22.0.0
- **npm** >= 8.0.0

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/redhat-data-and-ai/template-ui.git
   cd template-ui
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp env.template .env
   ```
   
   Edit `.env` and configure the required variables (see [Environment Configuration](#environment-configuration) below).

4. **Start development server**
   ```bash
   npm run dev
   ```

The application will be available at `http://localhost:5173`

## 🎨 Customizing Branding & Features

Template UI supports runtime configuration for branding (logo, colors, title), feature flags, agent endpoint, and compliance policies — without code changes or rebuilds.

**Full documentation:** [`docs/deployment-patterns.md`](docs/deployment-patterns.md)

### Quick start

Copy one of the ready-made example configs to get started:

```bash
# Local development (auth off, debug panel open)
cp config/ui/examples/minimal.yaml config/ui/settings.yaml

# Blue color scheme
cp config/ui/examples/blue-theme.yaml config/ui/settings.yaml

# Red Hat branding
cp config/ui/examples/red-hat-branding.yaml config/ui/settings.yaml

# Production-hardened (OPA enabled, strict security)
cp config/ui/examples/production.yaml config/ui/settings.yaml
```

### Configuration file

`config/ui/settings.yaml` is optional — built-in defaults are used if it is absent. Key sections:

```yaml
branding:
  title: "My Custom Agent"
  logo_url: "/custom-logo.svg"       # Place file in public/ to serve it
  favicon_url: "/custom-favicon.ico"
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
  debug_mode_default: false    # Default state of the debug panel toggle
  auth_enabled: true           # Set to false for local dev (no SSO credentials needed)
  mcp_apps_enabled: true       # Render interactive MCP Apps (ui://) in chat

agent:
  endpoint: ""                 # Agent URL — empty falls back to AGENT_HOST env var
  timeout_ms: 30000
  streaming: true
```

See [`config/ui/README.md`](config/ui/README.md) for the full schema and every environment variable override.

### Environment variable overrides

Env vars take precedence over the YAML file:

```bash
BRANDING_TITLE="Production Agent"
BRANDING_LOGO_URL="/prod-logo.svg"
FEATURE_AUTH_ENABLED=true
AGENT_ENDPOINT=https://prod-agent.example.com
```

See `env.template` for the complete list.

### Hot-reload

Branding and `agent.endpoint` / `agent.timeout_ms` changes are applied without a server restart. Security settings (`rate_limit`, `session`, `helmet`) require a restart. The config watcher logs which category each change falls into.

### Validation

The config is validated at startup. Invalid values cause the server to exit with a clear error:

```text
Config validation error: branding.colors.light.primary must be a valid hex color (got 'not-a-color')
```

## MCP Apps host

Template UI can render interactive [MCP Apps](https://modelcontextprotocol.io/extensions/apps/overview) (`ui://` HTML) inside chat when Template Agent is connected to a compliant MCP server.

- Enable with `features.mcp_apps_enabled` (or `FEATURE_MCP_APPS_ENABLED`)
- Point any SEP-1865-compliant server at the agent via `mcp.json` — no per-server UI widgets


## 📦 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | **Development mode** - Runs both client and server locally with hot reload |
| `npm run dev:client` | Runs only the frontend development server (Vite) |
| `npm run dev:server` | Runs only the backend development server (Fastify) |
| `npm run build` | **Production build** - Builds both client and server for deployment |
| `npm run build:client` | Builds only the frontend (TypeScript + Vite) |
| `npm run build:server` | Builds only the backend (TypeScript compilation) |
| `npm start` | **Production start** - Runs the built server application |
| `npm run lint` | Runs ESLint code analysis |

## 🛠️ Make Commands

For convenience, a `Makefile` is provided with common development shortcuts:

| Command | Description |
|---------|-------------|
| `make dev` | **Quick development start** - Installs dependencies and starts dev server |
| `make local` | **Local production build** - Installs dependencies, builds, and starts production server |
| `make clean` | **Clean workspace** - Removes node_modules and dist directories |

These commands are equivalent to:
- `make dev` → `npm ci && npm run dev`
- `make local` → `npm ci && npm run build && npm start`
- `make clean` → `rm -rf node_modules dist`

## ⚙️ Environment Configuration

Copy `env.template` to `.env` and configure the following variables:

### Server Configuration
```bash
PORT=8080                    # Server port (default: 8080)
ENVIRONMENT=development      # Environment mode: development | production | test
```

### Authentication & Security
```bash
# Cookie signing secret (minimum 32 characters required)
COOKIE_SIGN=your-secret-with-minimum-length-of-32-characters

# Enable/disable authentication (set to "false" for development with dummy user)
AUTH_ENABLED=false
```

### SSO/OAuth Configuration
```bash
# SSO Client credentials
SSO_CLIENT_ID=your-sso-client-id
SSO_CLIENT_SECRET=your-sso-client-secret

# SSO Provider settings
SSO_ISSUER_HOST=https://your-sso-provider.com
SSO_CALLBACK_URL=http://localhost:8080/auth/callback/oidc
```

### Agent Host
```bash
AGENT_HOST=http://localhost:5002
```

## 🏗️ Project Structure

```
template-ui/
├── src/
│   ├── frontend/           # React frontend application
│   │   ├── components/     # React components
│   │   ├── contexts/       # React context providers
│   │   ├── hooks/          # Custom React hooks
│   │   ├── pages/          # Route-level page components
│   │   ├── redux/          # Redux slices and store
│   │   ├── services/       # API client services
│   │   ├── types/          # TypeScript type definitions
│   │   ├── utils/          # Shared utilities
│   │   └── App.tsx         # Main application component
│   └── server/             # Fastify backend server
│       ├── plugins/        # Fastify plugins (auth, OPA, tracing)
│       ├── router/         # Route handlers (API, proxy, client)
│       ├── utils/          # Settings loader, OPA engine, Redis, config watcher
│       └── server.ts       # Server factory + config watcher setup
├── config/
│   ├── ui/
│   │   ├── settings.yaml   # Runtime config (optional — defaults used if absent)
│   │   ├── README.md       # Full schema + env-var reference
│   │   └── examples/       # Ready-to-use example configs
│   └── compliance/
│       ├── policy.rego     # OPA deny rules (package compliance.ui)
│       ├── data.json       # Static external data for OPA policies
│       └── README.md       # OPA policy authoring guide
├── deployment/
│   ├── openshift/          # OpenShift BuildConfig, ImageStream, Route, ConfigMap, Secret
│   └── overlays/
│       ├── kind/           # Kind cluster overlay (NodePort, no TLS)
│       └── openshift/      # OpenShift overlay
├── docs/
│   └── deployment-patterns.md  # Branding, feature flags, runtime config, agent endpoint, OPA
├── public/                 # Static assets served directly
├── e2e/                    # Playwright end-to-end tests
├── dist/                   # Built files (generated)
├── Containerfile           # Podman/Docker build definition (UBI base)
├── compose.yml             # Local development compose (Redis)
├── Makefile                # Task shortcuts (dev, local, clean)
├── package.json            # Dependencies and scripts
├── vite.config.ts          # Vite configuration
├── tsconfig.json           # TypeScript configuration
└── env.template            # Environment variables template
```

## 📚 Deployment Docs

| Document | What it covers |
|---|---|
| [`docs/deployment-patterns.md`](docs/deployment-patterns.md) | Branding customization, feature flag reference, runtime config examples, agent endpoint switching, OPA policy examples |
| [`config/ui/README.md`](config/ui/README.md) | Full YAML schema, every env-var override, hot-reload reference |
| [`config/compliance/README.md`](config/compliance/README.md) | OPA policy authoring, built-in rules, testing with `opa eval` |

## 🔧 Technology Stack

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Radix UI** - Component primitives
- **LangChain SDK** - AI/ML integration
- **React Router** - Navigation

### Backend
- **Fastify** - Web framework
- **TypeScript** - Type safety
- **OAuth2** - Authentication
- **Session Management** - User sessions

## 🔐 Authentication

The application supports two authentication modes:

### Development Mode (`AUTH_ENABLED=false`)
- Uses a dummy user for development
- No actual authentication required
- User: `developer@redhat.com`

### Production Mode (`AUTH_ENABLED=true`)
- Full SSO/OAuth2 authentication
- Requires valid SSO configuration
- Session-based authentication with token refresh

## 🚀 Deployment

### Building for Production
```bash
npm run build
```

This creates optimized builds in the `dist/` directory:
- `dist/frontend/` - Built React application
- `dist/server/` - Compiled server code

### Running in Production
```bash
npm start
```

The server serves both the API and the built frontend application.

### Docker Deployment
A `Containerfile` is provided for containerized deployment:

```bash
# Build container
podman build -t template-ui .

# Run container
podman run -p 8080:8080 --env-file .env template-ui
```

## 🔄 Development Workflow

1. **Start development server**
   ```bash
   npm run dev
   ```

2. **Make changes** to frontend (`src/frontend/`) or backend (`src/server/`)

3. **Changes auto-reload** thanks to Vite (frontend) and nodemon (backend)

4. **Run linting**
   ```bash
   npm run lint
   ```

5. **Build and test**
   ```bash
   npm run build
   npm start
   ```

### Common Issues

**Port already in use**
```bash
# Kill process on port 8080
lsof -ti:8080 | xargs kill -9
```

**Environment variables not loaded**
- Ensure `.env` file exists in project root
- Check that variables match `env.template` format

**Authentication issues**
- Verify SSO configuration in `.env`
- Check that callback URL matches SSO provider settings
- For development, set `AUTH_ENABLED=false`

**Build failures**
- Clear node_modules and reinstall: `rm -rf node_modules package-lock.json && npm install`
- Check TypeScript errors: `npx tsc --noEmit`
