# Template UI

A modern React-based frontend application with Fastify backend for interacting with data through natural language queries via Template Agent. The application features SSO authentication, real-time streaming responses, a clean chat interface, and a **Deep Research mode** with a real-time collapsible progress timeline.

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

## Deep Research Mode

The UI includes a toggle below the chat input to enable Deep Research mode. When active, queries are routed through the Template Agent's multi-phase research pipeline instead of the standard chat flow. The agent plans the research, runs parallel workers to gather data, synthesizes a structured report with visualizations, and streams every step back to the UI in real time.

### How It Works

1. **Toggle on** -- Click the microscope icon below the chat input to enable Deep Research. The placeholder changes to *"Ask a complex research question..."* to indicate the mode is active.
2. **Ask a question** -- Submit your query. The agent starts the research pipeline and streams progress events back via SSE.
3. **Watch progress** -- A collapsible timeline appears above the response, showing each phase as it executes (triage, probe, plan, research, synthesis, review).
4. **Approve the plan** (optional) -- If plan approval is enabled, a card appears with the proposed subqueries. You can approve, edit, or reject the plan before research begins.
5. **Get the report** -- The final synthesized answer renders as rich Markdown with tables, Mermaid charts, and structured sections.

### Session Locking

Once Deep Research starts in a conversation (either from a previous message or the current one), the toggle locks and cannot be disabled for that chat. This prevents state corruption from switching modes mid-research. A tooltip explains why the toggle is disabled.

### Deep Research UI Components

| Component | File | What it does |
|-----------|------|-------------|
| **Deep Research Toggle** | `InputForm.tsx` | Microscope button below the chat input. Enables/disables Deep Research per message. Locks automatically once research starts in the conversation. |
| **Deep Research Timeline** | `DeepResearchTimeline.tsx` | Collapsible, phase-grouped progress timeline. Shows real-time events from the research pipeline (triage, probe, plan, research, synthesis, review). Auto-collapses when research completes. |
| **Activity Timeline** | `ActivityTimeline.tsx` | Detailed event-by-event activity log with icons, shown alongside the phase timeline. Auto-collapses when loading finishes. |
| **Plan Approval Card** | `PlanApprovalCard.tsx` | When plan approval is enabled, displays the agent's query understanding, proposed subqueries, and approve/edit/reject actions. Editing lets you modify subqueries before execution. |
| **Mermaid Block** | `MermaidBlock.tsx` | Renders Mermaid.js diagrams (bar charts, pie charts, flowcharts, timelines) embedded in the research report. Uses a dark theme and handles `xychart-beta` syntax. Falls back to raw code on render errors. |

### Real-time Event Streaming

The `useDataStream` hook processes SSE chunks from the agent. When it receives a `deep_research_status` event, it:

1. Timestamps the event and tags it with the triggering message ID.
2. Appends it to the message's `deepResearchEvents` array.
3. Notifies the UI to re-render the timeline immediately.
4. For `plan_pending` events with `requires_approval`, extracts subqueries and shows the Plan Approval Card.
5. For `final_answer` events, stops token streaming and marks the research as complete.

This means every pipeline step -- from "Worker 3/7 complete" to "Review started" -- appears in the timeline the moment the agent emits it, not in batches.

### Requirements

Deep Research requires the Template Agent to be running with `DEEP_RESEARCH_ENABLED=true` and the MCP server to be available for tool access. The `AGENT_HOST` environment variable in `.env` must point to the running agent (default: `http://localhost:5002`).

## Project Structure

```
template-ui/
├── src/
│   ├── frontend/               # React frontend application
│   │   ├── components/         # React components
│   │   │   ├── DeepResearchTimeline.tsx  # Phase-grouped research progress
│   │   │   ├── ActivityTimeline.tsx      # Detailed event activity log
│   │   │   ├── PlanApprovalCard.tsx      # Deep Research plan approval UI
│   │   │   ├── MermaidBlock.tsx          # Mermaid.js chart renderer
│   │   │   ├── ChatMessagesView.tsx      # Chat message display
│   │   │   ├── InputForm.tsx             # Chat input with DR toggle
│   │   │   ├── mdComponents.tsx          # Markdown component overrides
│   │   │   ├── Sidebar.tsx               # Chat list sidebar
│   │   │   ├── layout/AppLayout.tsx      # Main layout with sidebar
│   │   │   └── ui/                       # Radix UI primitives
│   │   ├── hooks/              # Custom React hooks
│   │   │   └── useDataStream.tsx  # SSE stream handler (standard + deep research)
│   │   ├── pages/              # Route-level page components
│   │   │   ├── ChatPage.tsx    # Chat page with DR state management
│   │   │   └── HomePage.tsx    # Landing page
│   │   ├── types/              # TypeScript type definitions
│   │   │   └── chat.ts         # DeepResearchEvent, Message types
│   │   ├── lib/                # Utility libraries
│   │   └── App.tsx             # Main application component
│   └── server/                 # Fastify backend server
│       ├── plugins/            # Fastify plugins (auth, etc.)
│       ├── router/             # API routes (proxies to agent)
│       └── server.ts           # Server configuration
├── public/                     # Static assets
├── dist/                       # Built files (generated)
├── package.json                # Dependencies and scripts
├── vite.config.ts              # Vite configuration
├── tsconfig.json               # TypeScript configuration
└── env.template                # Environment variables template
```

## 🔧 Technology Stack

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Styling
- **Radix UI** - Component primitives
- **Mermaid.js** - Chart and diagram rendering (bar, pie, flowchart, timeline)
- **React Markdown** - Rich Markdown rendering with GFM support
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



