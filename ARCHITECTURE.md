# BuildValve — Architecture

## Overview

BuildValve is a stateless, config-driven GitLab pipeline launcher. It acts as a controlled proxy between end users and GitLab's CI/CD pipelines. The application has no persistent database; all state lives in either the YAML config file (pipeline definitions) or in GitLab itself (pipeline execution state).

---

## System Diagram

```
+-------------------+       +----------------------+       +-------------------+
|                   |       |                      |       |                   |
|   Browser (SPA)   | <---> |  Backend             | <---> |  GitLab Instance  |
|   React + Vite    |       |  Node.js + Express   |       |  (self-hosted)    |
|                   |       |  SAML SP             |       |                   |
+-------------------+       +----------+-----------+       +-------------------+
        |                              |
        |  httpOnly session cookie     |  Service account token (glpat-*)
        |                              |
        |                   +----------+-----------+
        |                   |                      |
        |                   |  SAML IdP            |
        |                   |  (Okta/Azure/ADFS/   |
        |                   |   Keycloak)          |
        |                   +----------------------+
```

- **Frontend (SPA)**: Renders the launcher UI from server-provided config. Never talks to GitLab directly.
- **Backend**: Validates identity (SAML), enforces authorization (config), and relays pipeline commands to GitLab using a service account.
- **GitLab**: Only touched by the service account token. End users do not need GitLab accounts.

---

## Auth Architecture

### Flow (SAML 2.0)

1. User visits app with no session → redirected to `/api/auth/login`
2. Backend generates SAML AuthnRequest → redirects to IdP SSO URL
3. User authenticates at IdP (password, MFA, etc.)
4. IdP POSTs SAML Response to `/api/auth/saml/callback` (ACS URL)
5. Backend validates assertion (signature, expiry, audience)
6. Extracts email + groups from attributes
7. Checks permissions against `config.yml`
8. Creates session with httpOnly cookie → redirects to SPA
9. All subsequent API calls use session cookie; GitLab calls use service account token

### AuthProvider Interface

```typescript
interface AuthUser {
  email: string           // canonical identity across all providers
  provider: string        // "saml" | (future: "github" | "gitlab")
  groups?: string[]
}

interface AuthProvider {
  type: string
  label: string
  setupRoutes(router: Router): void
}
```

### Email as Canonical Identity

Permissions are matched by **email address**, not username. This ensures provider-agnostic authorization — a user logging in via SAML or (future) GitHub OAuth resolves to the same permissions if the email matches.

---

## Permission Model

```
auth           →  who you are  (SAML assertion)
permissions    →  what you can do  (config.yml)
execution      →  service account makes actual GitLab API calls
```

If a user is not in `permissions`, they get a 403 after login. Backend rejects pipeline triggers for projects outside the user's allowed list before any GitLab call is made.

---

## File Structure (Actual)

```
buildvalve/
├── config/
│   ├── config.yml              # gitignored — copy from .env.example
│   └── config.schema.json
├── server/
│   └── src/
│       ├── index.ts            # Express app entry point
│       ├── config.ts           # YAML loader + AJV schema validation
│       ├── routes/
│       │   ├── auth.ts         # SAML login/callback/metadata/logout/me
│       │   ├── pipelines.ts    # Pipeline CRUD + trigger + history + logs
│       │   └── admin.ts        # Config inspection (redacted) — admins only
│       ├── middleware/
│       │   ├── requireAuth.ts  # Session guard
│       │   └── session.ts      # express-session setup
│       ├── services/
│       │   ├── auth/
│       │   │   ├── index.ts        # Auth provider registry
│       │   │   ├── saml-provider.ts
│       │   │   └── types.ts
│       │   ├── gitlab.ts           # Real GitLab API calls (service account)
│       │   ├── mock-gitlab.ts      # In-memory mock for local dev
│       │   └── permissions.ts      # Email + group matching
│       ├── types/
│       │   └── index.ts            # AppConfig, GitLabPipeline, GitLabJob, etc.
│       └── utils/
│           └── logger.ts
├── client/
│   └── src/
│       ├── App.tsx             # Router + route definitions
│       ├── vite-env.d.ts       # __APP_VERSION__ global type declaration
│       ├── api/
│       │   ├── client.ts       # fetchApi wrapper + ApiError
│       │   └── queries.ts      # pipelinesApi, authApi, adminApi
│       ├── components/
│       │   ├── layout/
│       │   │   └── AppShell.tsx    # Sidebar nav, auth guard, layout
│       │   └── ui/                 # Shadcn/ui components
│       ├── contexts/
│       │   └── AuthContext.tsx     # User session state
│       └── pages/
│           ├── LoginPage.tsx
│           ├── DashboardPage.tsx       # Project/pipeline table with status
│           ├── PipelineLaunchPage.tsx  # Variable form + trigger
│           ├── PipelineRunPage.tsx     # Live run status + jobs table
│           ├── PipelineLogsPage.tsx    # Full-screen live tail of job logs
│           ├── PipelineHistoryPage.tsx # Execution history for a ref
│           ├── ProfilePage.tsx
│           └── AdminConfigPage.tsx     # Rendered config.yml (admins only)
├── .env.example
├── .gitignore
├── package.json                # Workspace root
├── README.md
└── ARCHITECTURE.md
```

---

## API Endpoints

### Auth

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/auth/providers` | Returns list of enabled auth providers for the login page |
| GET | `/api/auth/:provider/login` | Redirect to IdP / OAuth authorize |
| POST | `/api/auth/saml/callback` | ACS — receive SAML assertion, create session |
| GET | `/api/auth/saml/metadata` | SAML SP metadata XML |
| POST | `/api/auth/logout` | Destroy session |
| GET | `/api/auth/me` | Current user + allowed projects |

### Pipelines

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/pipelines` | User's allowed pipeline configs |
| POST | `/api/pipelines/trigger` | Trigger a pipeline (validates vars + perms) |
| GET | `/api/pipelines/recent` | Recent pipelines for user's projects (LRU cached, 10s TTL) |
| GET | `/api/pipelines/:projectId/history?ref=` | Pipeline execution history for a ref |
| GET | `/api/pipelines/:projectId/:pipelineId` | Single pipeline + jobs |
| GET | `/api/pipelines/:projectId/jobs/:jobId/trace` | Raw job log text (for live tail) |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/admin/config` | Loaded config with tokens redacted (admins only) |

---

## GitLab API Calls (Service Account)

| Purpose | Method | GitLab endpoint |
|---------|--------|-----------------|
| Trigger pipeline | POST | `/api/v4/projects/:id/pipeline` |
| List pipelines | GET | `/api/v4/projects/:id/pipelines` |
| Pipeline details | GET | `/api/v4/projects/:id/pipelines/:pid` |
| Pipeline jobs | GET | `/api/v4/projects/:id/pipelines/:pid/jobs` |
| Job log trace | GET | `/api/v4/projects/:id/jobs/:jid/trace` |

---

## Frontend Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | `LoginPage` | SSO entry point |
| `/` | `DashboardPage` | All allowed projects + pipeline table |
| `/project/:id/pipeline/:name` | `PipelineLaunchPage` | Variable form + Launch button |
| `/project/:id/pipeline/:name/run/:runId` | `PipelineRunPage` | Live pipeline status + jobs |
| `/project/:id/pipeline/:name/run/:runId/job/:jobId/logs` | `PipelineLogsPage` | Full-screen live job log tail |
| `/project/:id/pipeline/:name/history` | `PipelineHistoryPage` | Execution history |
| `/profile` | `ProfilePage` | Logged-in user info |
| `/admin` | `AdminConfigPage` | Config viewer (admins only) |

---

## Key Design Decisions

### Stateless Backend
No database. Pipeline history is fetched live from GitLab on demand. The only server-side state is the in-memory LRU cache for recent pipelines (10s TTL) to avoid hammering GitLab on dashboard load.

### Mock GitLab Service
`MockGitLabService` extends `GitLabService` and overrides all API methods with in-memory state. Enabled via `gitlab.mock: true` in config. Pipelines auto-complete after 15 seconds. Cleared on server restart.

### Variable Locking
`locked: true` variables are never sent to the client; they are injected server-side. Users cannot observe or override them. This is the primary security control for gating pipeline behaviour.

### Route Ordering (Express)
The `/api/pipelines/:projectId/history` route is registered **before** `/api/pipelines/:projectId/:pipelineId` to prevent Express interpreting the literal string `"history"` as a `:pipelineId` param.

### Version Injection
`__APP_VERSION__` is a build-time constant injected by Vite from `client/package.json`. No runtime overhead; it is replaced by the literal string at build time.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + TypeScript + Vite |
| UI Components | Shadcn/ui + Tailwind CSS 3 |
| Data fetching | TanStack Query v5 |
| Routing | React Router v7 |
| Backend | Node.js + Express |
| Auth | `@node-saml/passport-saml` |
| Config | YAML (`js-yaml`) + AJV schema validation |
| Sessions | `express-session` (in-memory, Redis-swappable) |
| Caching | LRU Cache (recent pipelines) |
| Logging | Pino (`logger.ts`) |
