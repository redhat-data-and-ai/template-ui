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

Template UI supports runtime configuration for branding (logo, colors, title) and feature flags without code changes. This enables multi-tenancy and per-agent customization.

### Configuration File

Create a `config/ui/settings.yaml` file (optional - defaults are used if not present):

```yaml
branding:
  logo_url: "/custom-logo.svg"        # Path to logo image
  title: "My Custom Agent"            # App title (browser tab + masthead)
  favicon_url: "/custom-favicon.ico"  # Optional favicon
  colors:
    light:                            # Light theme colors
      primary: "#0066cc"
      accent: "#a60000"
      background: "#ffffff"
      foreground: "#1a1a1a"
    dark:                             # Dark theme colors
      primary: "#4dabf7"
      accent: "#f56e6e"
      background: "#0a1628"
      foreground: "#f0f4f8"

features:
  debug_mode_default: false           # Default for debug mode (users can toggle)
  memory_enabled_default: true        # Default for memory feature (users can toggle)
  auth_enabled: true                  # Enable/disable authentication

agent:
  endpoint: ""                        # Agent API URL (empty = use AGENT_HOST env var)
  timeout_ms: 30000                   # Request timeout
  streaming: true                     # Enable SSE streaming
```

**Example configs** are available in `config/ui/examples/`:
- `blue-theme.yaml` - Blue color scheme
- `minimal.yaml` - Minimal configuration with auth disabled

### Environment Variable Overrides

Config values can be overridden via environment variables (takes precedence over YAML):

```bash
BRANDING_TITLE="Production Agent"
BRANDING_LOGO_URL="/prod-logo.svg"
FEATURE_AUTH_ENABLED=true
AGENT_ENDPOINT=https://prod-agent.example.com
```

See `env.template` for all available overrides.

### Applying Changes

1. Edit `config/ui/settings.yaml` or set environment variables
2. Restart the server: `npm start`
3. Changes are applied immediately (no rebuild needed)

### Validation

The config is validated at startup. Invalid values (e.g., malformed hex colors, missing required fields) will cause the server to fail with a clear error message:

```
Config validation error: branding.colors.light.primary must be a valid hex color (got 'not-a-color')
```

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
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/           # Utility libraries
│   │   └── App.tsx        # Main application component
│   └── server/            # Fastify backend server
│       ├── plugins/       # Fastify plugins (auth, etc.)
│       ├── router/        # API routes
│       └── server.ts      # Server configuration
├── public/                # Static assets
├── dist/                  # Built files (generated)
├── package.json          # Dependencies and scripts
├── vite.config.ts        # Vite configuration
├── tsconfig.json         # TypeScript configuration
└── env.template          # Environment variables template
```

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
