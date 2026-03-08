# BuildValve

[![CI](https://github.com/cergfix/buildvalve/actions/workflows/ci.yml/badge.svg)](https://github.com/cergfix/buildvalve/actions/workflows/ci.yml)

**A self-hosted, team-friendly CI/CD pipeline launcher.**

![BuildValve dashboard](docs/screenshots/dashboard.png)

### Views

| Launch a pipeline | Conditional variables | Live run status |
| :---: | :---: | :---: |
| ![Launch](docs/screenshots/launch.png) | ![Conditional](docs/screenshots/launch-conditional.png) | ![Run](docs/screenshots/run.png) |

| Live job logs | Run history | Recent activity |
| :---: | :---: | :---: |
| ![Logs](docs/screenshots/logs.png) | ![History](docs/screenshots/history.png) | ![Recent runs](docs/screenshots/recent-runs.png) |

| Login |
| :---: |
| ![Login](docs/screenshots/login.png) |


BuildValve lets you give your team a simple dashboard of big "Launch" buttons for their CI/CD pipelines across **GitLab**, **GitHub Actions**, and **CircleCI** — without handing out direct access, exposing raw CI variables, or forcing everyone to learn each provider's UI.

You configure which pipelines are available and who can trigger them. Your team logs in via your company's SSO and simply clicks **Launch**.

---

## Why BuildValve?

- **Multi-provider** — GitLab, GitHub Actions, and CircleCI projects on the same dashboard.
- **No CI accounts needed for users** — service account tokens handle all API calls.
- **Per-pipeline permissions** — restrict sensitive pipelines to specific users or groups.
- **Safe variable pre-filling** — lock sensitive variables server-side so users can't override them.
- **Conditional variables** — show/hide parameters based on other parameter values (`needs`), and the hidden ones never reach the CI provider.
- **Audit-ready** — structured JSON access logs to stdout for every user action (login, trigger, view, admin).
- **SSO-native** — integrates with SAML 2.0, GitHub OAuth, Google OAuth, GitLab OAuth, or local accounts.
- **Live monitoring** — SSE-powered real-time pipeline status and live job log streaming.

---

## Quick Start with Docker

The fastest way to run BuildValve. No Node.js installation required.

**1. Create a config file** (`config.yml`):

```yaml
ci_providers:
  - name: gitlab-corp
    type: gitlab
    url: https://gitlab.example.com
    token: glpat-xxxxxxxxxxxx

auth:
  providers:
    - type: saml
      enabled: true
      label: "Company SSO"
      entry_point: https://idp.example.com/sso/saml
      issuer: https://buildvalve.example.com
      callback_url: https://buildvalve.example.com/api/auth/saml/callback
      cert: |
        MIICpDCCAYwCCQDU+pQ4pHgSp...

session:
  secret: change-this-to-a-long-random-string
  max_age: 28800

permissions:
  - groups: [devops-team]
    projects: ["42"]

projects:
  - id: "42"
    name: "My App"
    provider: gitlab-corp
    external_id: "42"
    pipelines:
      - name: "Deploy"
        ref: main
        variables: []
```

See the full [Configuration](#configuration) section below for all options.

**2. Create a `Dockerfile`** that extends the base image:

```dockerfile
FROM ghcr.io/cergfix/buildvalve:latest
COPY config.yml /app/config/config.yml
```

**3. Build and run:**

```bash
docker build -t my-buildvalve .
docker run -d -p 3000:3000 my-buildvalve
```

Open **http://localhost:3000** and you're done.

---

## Try It Locally (no config needed)

A ready-made dev config with mock auth and mock CI providers is included in the `dev/` directory. One command to go from zero to a running dashboard:

```bash
./dev/start.sh
```

This builds a derived Docker image from `dev/Dockerfile` (which copies `dev/config.yml` into the base image) and runs it with:
- **Mock auth** — click "Bypass Login (Dev)" to sign in as `bob@company.com`
- **Mock CI providers** — pipeline triggers are simulated in-memory and auto-complete after ~15 seconds
- **Three providers configured** — GitLab, GitHub Actions, and CircleCI mock projects

Open **http://localhost:3000** and click the login button.

> You can edit `dev/config.yml` to add more projects or change the mock user — re-run `./dev/start.sh` to rebuild.

---

## Build from Source

### Requirements

- **Node.js** >= 22 (use `nvm use` if you have [nvm](https://github.com/nvm-sh/nvm) installed — a `.nvmrc` is included)
- A **CI provider service account token** for the providers you want to use
- A **SAML 2.0 IdP** for production use (Okta, Azure AD, Keycloak, ADFS)

### 1. Clone and install

```bash
git clone https://github.com/cergfix/buildvalve.git
cd buildvalve
npm install
```

### 2. Configure

Create a `config/config.yml` file (it's gitignored — never commit it):

```bash
cp dev/config.yml config/config.yml
```

Edit `config/config.yml` with your values — see the [Configuration](#configuration) section below.

### 3. Run in development

```bash
# Start the backend (port 3000)
cd server && npm run dev

# In a second terminal — start the frontend (port 5173)
cd client && npm run dev
```

Open **http://localhost:5173** in your browser. The frontend dev server automatically proxies all `/api/*` requests to the backend.

### 4. Run in production

```bash
# Build the frontend
cd client && npm run build

# The backend serves the built SPA automatically
cd ../server && npm start
```

Set `NODE_ENV=production` in your environment to enable secure (HTTPS-only) session cookies.

### 5. Build a Docker image locally

```bash
docker build -t buildvalve .
```

Then create a derived image with your config (see [Quick Start with Docker](#quick-start-with-docker)) or set `CONFIG_PATH` in your environment for local testing.

---

## Deployment Options

BuildValve publishes two Docker images and one SPA bundle on each release:

| Artifact | Description | Use case |
|----------|-------------|----------|
| `ghcr.io/cergfix/buildvalve` | Combined API + client SPA | Default — simplest deployment |
| `ghcr.io/cergfix/buildvalve-api` | API only (no static files) | Split deployment — pair with the SPA hosted on a CDN |
| `buildvalve-app-<version>.tar.gz` | Pre-built SPA bundle (release asset) | Drop straight onto your CDN — no Node.js build required |

### Combined (default)

Server and client in one container. This is the simplest approach:

```bash
docker run -d \
  -p 3000:3000 \
  -v ./config.yml:/app/config/config.yml:ro \
  -v buildvalve-data:/app/data \
  ghcr.io/cergfix/buildvalve:latest
```

The `buildvalve-data` named volume persists sessions and the history of runs
triggered through BuildValve across container restarts. Omit it if you don't
need either of those to survive recreation.

### Split deployment (API + CDN)

For deploying the client on a CDN and the API as a separate backend:

**1. Get the SPA bundle.** Either grab the pre-built tarball from the GitHub release:

```bash
curl -LO https://github.com/cergfix/buildvalve/releases/download/v0.3.2/buildvalve-app-0.3.2.tar.gz
mkdir buildvalve-app && tar -xzf buildvalve-app-0.3.2.tar.gz -C buildvalve-app
```

…or build from source with a baked-in API URL:

```bash
VITE_API_URL=https://api.buildvalve.example.com npm run build --workspace=client
```

**2. Run the API:**

```bash
docker run -d -p 3000:3000 \
  -e CORS_ORIGIN=https://buildvalve.example.com \
  -v ./config.yml:/app/config/config.yml:ro \
  ghcr.io/cergfix/buildvalve-api:latest
```

**3. Upload the SPA to your CDN** (S3 + CloudFront, Vercel, Netlify, etc.). Configure SPA fallback so unknown routes serve `index.html`.

The pre-built tarball ships with `VITE_API_URL=""` (same-origin). To use it on a CDN that does not proxy `/api/*` to your API host, either build from source with `VITE_API_URL` set, or configure your CDN to rewrite `/api/*` to the API origin. Set `CORS_ORIGIN` on the API to allow cross-origin requests from the SPA domain.

---

## Configuration

All configuration lives in **`config/config.yml`**. This file is gitignored — never commit it, as it contains secrets.

### Minimal example (development)

```yaml
ci_providers:
  - name: default
    type: gitlab
    url: https://gitlab.example.com
    token: glpat-xxxxxxxxxxxx
    mock: true                    # Use mock CI — no real API calls

auth:
  providers:
    - type: mock
      enabled: true
      label: "Bypass Login (Dev)"
      mock_user:
        email: "alice@company.com"
        groups:
          - devops-team

session:
  secret: any-random-string-here
  max_age: 86400

admins:
  - alice@company.com

permissions:
  - users: [alice@company.com]
    projects: ["42"]

projects:
  - id: "42"
    name: "My App"
    provider: default
    external_id: "42"
    description: "Main service"
    pipelines:
      - name: "Deploy to Staging"
        ref: staging
        variables:
          - key: ENVIRONMENT
            value: staging
            locked: true
          - key: VERSION
            value: ""
            locked: false
            description: "Docker image tag to deploy"
```

### Multi-provider example

```yaml
ci_providers:
  - name: gitlab-corp
    type: gitlab
    url: https://gitlab.example.com
    token: glpat-xxxxxxxxxxxx
  - name: github-oss
    type: github-actions
    github_token: ghp-xxxxxxxxxxxx
  - name: circleci-main
    type: circleci
    circleci_token: cc-xxxxxxxxxxxx

projects:
  - id: backend
    name: "Backend API"
    provider: gitlab-corp
    external_id: "42"
    pipelines:
      - name: "Deploy to Staging"
        ref: staging
        variables: []
      - name: "Deploy to Production"
        ref: main
        allowed_groups: [devops]    # only devops can see/trigger this pipeline
        variables: []

  - id: frontend
    name: "Frontend App"
    provider: github-oss
    external_id: myorg/frontend
    pipelines:
      - name: "Deploy"
        ref: main
        workflow_id: deploy.yml     # GitHub Actions workflow file
        variables: []

  - id: api
    name: "API Service"
    provider: circleci-main
    external_id: gh/myorg/api
    pipelines:
      - name: "Release"
        ref: main
        variables: []
```

### Full production example (SAML)

```yaml
ci_providers:
  - name: gitlab-corp
    type: gitlab
    url: https://gitlab.example.com
    token: glpat-xxxxxxxxxxxx

auth:
  providers:
    - type: saml
      enabled: true
      label: "Company SSO"
      entry_point: https://idp.example.com/sso/saml
      issuer: https://buildvalve.example.com
      callback_url: https://buildvalve.example.com/api/auth/saml/callback
      cert: |
        MIICpDCCAYwCCQDU+pQ4pHgSp...
      attribute_mapping:
        email: http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress
        groups: http://schemas.xmlsoap.org/claims/Group

session:
  secret: a-long-random-secret-change-this
  max_age: 28800

admins:
  - platform@example.com

permissions:
  - groups: [devops-team]
    projects: ["42", "55"]

  - users: [charlie@example.com]
    projects: ["42"]

  # Wildcards in `users:` — handy for opening up read-only/safe pipelines to
  # everyone in your company without listing each address. Three forms:
  #   "alice@co.com"     — exact (case-insensitive)
  #   "*@example.com"    — any address on that domain
  #   "*"                — any authenticated user, regardless of domain
  # The same patterns work in `admins:` and pipeline-level `allowed_users:`.
  - users: ["*@example.com"]
    projects: ["public-docs-build"]

projects:
  - id: "42"
    name: "Backend API"
    provider: gitlab-corp
    external_id: "42"
    description: "Main backend service"
    pipelines:
      - name: "Deploy to Staging"
        ref: staging
        variables:
          - key: ENVIRONMENT
            value: staging
            locked: true
          - key: VERSION
            value: ""
            locked: false
            description: "Docker image tag to deploy"

      - name: "Deploy to Production"
        ref: main
        allowed_groups: [devops-team]
        variables:
          - key: ENVIRONMENT
            value: production
            locked: true
          - key: VERSION
            value: ""
            locked: false
            description: "Docker image tag to deploy"

  - id: "55"
    name: "Frontend App"
    provider: gitlab-corp
    external_id: "55"
    description: "Customer-facing SPA"
    pipelines:
      - name: "Build & Deploy"
        ref: main
        variables: []
```

### Configuration reference

| Key | Required | Description |
|-----|----------|-------------|
| `public_url` | | Externally-visible URL of this instance (e.g. `https://buildvalve.example.com` or `http://localhost:3000`). Drives HSTS, `upgrade-insecure-requests`, and the session cookie's Secure flag. `https://...` → full HTTPS mode. `http://...` or a bare host (no scheme) → plain-HTTP mode. Omitted → HTTPS-aware (safe default for prod). |
| `ci_providers` | ✅ | Array of CI provider definitions (see below) |
| `session.secret` | ✅ | Random string for signing session cookies |
| `session.max_age` | | Session duration in seconds (default: 86400) |
| `storage.type` | | Persistent backend for sessions + BuildValve-triggered run history. `sqlite` (default — file at `/app/data/`), `redis`, `dynamodb`, or `mysql`. Mount `/app/data` as a Docker volume to keep SQLite data across container restarts. |
| `storage.redis_url` | | Required when `storage.type: redis`. Same instance is shared by sessions and run history. |
| `storage.region` | | AWS region for `storage.type: dynamodb`. |
| `storage.table_name` | | DynamoDB table name (default: `buildvalve`). The table must exist before BuildValve starts. |
| `storage.endpoint` | | DynamoDB endpoint override for local testing (e.g. `http://localhost:8000` for DynamoDB Local). |
| `storage.mysql_url` | | Required when `storage.type: mysql`. Format: `mysql://user:pass@host:3306/db[?ssl=true]`. RDS MySQL 8.x / Aurora MySQL compatible. |
| `storage.sqlite_path` | | Directory for SQLite DB files when `storage.type: sqlite`. Default: `./data` (inside the container — declared as a `VOLUME`). Set to an absolute path like `/mnt/efs/buildvalve` to use EFS/NFS. Single-writer only — for multi-instance use redis/mysql/dynamodb. |
| `storage.run_cleanup_crons` | | Whether this instance runs periodic cleanup (expired session sweep + 90-day run-history prune). Default: `true`. When running multiple BuildValve replicas behind a load balancer against a shared DB (MySQL / Redis), set to `false` on all replicas except one so cleanup has a single owner and replicas don't race on the same DELETEs. DynamoDB uses native TTL (no app-level cron), so this flag has no effect there. |
| `admins` | | List of emails that can view the Admin Settings page |
| `auth.providers` | ✅ | At least one enabled auth provider (`saml`, `github`, `google`, `gitlab`, `local`, `mock`) |
| `permissions` | ✅ | Who can trigger which projects |
| `projects` | ✅ | Project and pipeline definitions |

### CI provider options

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Unique identifier referenced by projects |
| `type` | ✅ | `gitlab`, `github-actions`, or `circleci` |
| `mock` | | `true` for in-memory mock (dev only) |
| `url` | GitLab | Base URL of your GitLab instance |
| `token` | GitLab | `glpat-*` service account token |
| `github_token` | GitHub | Personal access token or GitHub App token |
| `github_api_url` | | Custom API URL for GitHub Enterprise (default: `https://api.github.com`) |
| `circleci_token` | CircleCI | CircleCI API token |
| `circleci_api_url` | | Custom API URL for CircleCI Server (default: `https://circleci.com`) |

### Project options

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique string identifier (used in URLs and permissions) |
| `name` | ✅ | Display name |
| `description` | | Display description |
| `provider` | ✅ | References a `ci_providers[].name` |
| `external_id` | ✅ | Provider-specific project identifier (e.g. `"42"`, `"owner/repo"`, `"gh/org/repo"`) |
| `pipelines` | ✅ | Array of pipeline definitions |

### Pipeline options

| Field | Required | Description |
|-------|----------|-------------|
| `name` | ✅ | Display name |
| `ref` | ✅ | Git ref (branch/tag) to run against |
| `workflow_id` | GitHub | Workflow filename or ID (e.g. `deploy.yml`) |
| `allowed_users` | | Restrict to these users (within project permissions) |
| `allowed_groups` | | Restrict to these groups |
| `variables` | | Array of variable definitions |

### Variable options

| Field | Description |
|-------|-------------|
| `key` | CI variable name |
| `value` | Default value (can be empty string) |
| `locked` | If `true`, value is injected server-side and never sent to the browser |
| `description` | Help text shown in the launch form |
| `type` | `text` (default), `select` (dropdown), or `radio` (inline radio buttons) |
| `options` | Array of allowed values for `select`/`radio` types — server rejects values not in this list |
| `needs` | Show this variable only when other variables match. Map of `other-key → value(s)`. All keys must match (AND); list values are any-of. Hidden variables are dropped from the CI payload. |

**Variable type examples:**

```yaml
variables:
  # Free text (default)
  - key: VERSION
    value: ""
    locked: false
    description: "Docker image tag"

  # Dropdown select
  - key: REGION
    value: us-east-1
    locked: false
    type: select
    options: [us-east-1, us-west-2, eu-west-1]

  # Radio buttons
  - key: DRY_RUN
    value: "true"
    locked: false
    type: radio
    options: ["true", "false"]

  # Conditional — only visible (and only sent to the CI provider) when
  # ENVIRONMENT == "production". Multiple keys combine with AND;
  # list values are any-of.
  - key: NOTIFY_STAKEHOLDERS
    value: "false"
    locked: false
    type: radio
    options: ["true", "false"]
    needs:
      ENVIRONMENT: production

  # Multi-key example — show only when ENV is staging/prod AND DRY_RUN=false
  - key: ROLLBACK_VERSION
    value: ""
    locked: false
    needs:
      ENVIRONMENT: [staging, production]
      DRY_RUN: "false"
```

### Persistent storage

BuildValve persists two things across restarts: sessions (so logged-in users stay signed in) and the history of pipelines triggered through BuildValve (so the History page can filter to just your team's runs). Three backends:

#### SQLite (default — single instance)

```yaml
storage:
  type: sqlite
  # sqlite_path: /mnt/efs/buildvalve     # optional — see below
```

Default location is `./data/` (inside the container, declared as a `VOLUME`). For a Docker named volume:

```bash
docker run -v buildvalve-data:/app/data ghcr.io/cergfix/buildvalve:latest
```

**EFS / NFS-mounted path.** If you'd rather put the DB files on an EFS mount so they survive instance replacement (typical ECS / EKS setup), override the directory:

```yaml
storage:
  type: sqlite
  sqlite_path: /mnt/efs/buildvalve
```

```bash
docker run -v /mnt/efs:/mnt/efs ghcr.io/cergfix/buildvalve:latest
```

No good for horizontally-scaled deployments — SQLite is single-writer, and EFS doesn't change that. For more than one BuildValve instance pick Redis, DynamoDB, or MySQL.

#### Redis

```yaml
storage:
  type: redis
  redis_url: redis://your-host:6379
```

Shared across all BuildValve instances. Sub-millisecond reads. Good if you already operate Redis.

#### DynamoDB (AWS-native, no infra)

```yaml
storage:
  type: dynamodb
  region: us-east-1
  table_name: buildvalve
  # endpoint: http://localhost:8000   # uncomment for DynamoDB Local
```

Credentials follow the standard AWS provider chain (IAM role on ECS/EKS/EC2, env vars, shared config — in that order).

**Provision the table once** before starting BuildValve. The table needs a composite key (`pk: string`, `sk: string`) **and TTL enabled on the `ttl` attribute**:

```bash
# 1. Create the table
aws dynamodb create-table \
  --table-name buildvalve \
  --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# 2. Enable TTL on the `ttl` attribute (required — see below)
aws dynamodb update-time-to-live \
  --table-name buildvalve \
  --time-to-live-specification "Enabled=true,AttributeName=ttl" \
  --region us-east-1
```

**Why TTL matters.** Every row BuildValve writes carries a `ttl` attribute (unix-seconds = `triggered_at + 90 days` for run history, and `cookie.expires` for sessions). DynamoDB's native TTL feature reads that attribute and deletes the item shortly after expiry. **If you skip step 2, the table grows without bound** — every triggered run stays forever, and every session row outlives its cookie. BuildValve's session store also filters at read time (so expired sessions are still ignored even before Dynamo's sweep), so the security guarantee holds either way — but you'll pay for storage you don't need.

Confirm it's on:

```bash
aws dynamodb describe-time-to-live --table-name buildvalve --region us-east-1
# Look for: TimeToLiveStatus: ENABLED, AttributeName: ttl
```

A single table holds both sessions (`pk = "session#<sid>"`) and triggered-run history (`pk = "tr#<project>#<ref>"`) — they share the same table for simplicity. Pay-per-request pricing is effectively free at BuildValve's traffic profile.

#### MySQL (RDS / Aurora)

```yaml
storage:
  type: mysql
  mysql_url: mysql://buildvalve:secret@your-rds-instance.us-east-1.rds.amazonaws.com:3306/buildvalve?ssl=true
```

Compatible with **RDS MySQL 8.x** and **Aurora MySQL**. BuildValve creates the two tables (`bv_sessions`, `bv_triggered_runs`) on first connect — the MySQL user just needs `CREATE`, `SELECT`, `INSERT`, `UPDATE`, `DELETE` on the database.

For RDS with TLS-required endpoints, append `?ssl=true` to the URL. If you're hitting a self-signed/private CA and want to skip cert verification, use `?ssl={"rejectUnauthorized":false}` (URL-encode the JSON).

```sql
-- one-time setup (run as an admin user):
CREATE DATABASE buildvalve CHARACTER SET utf8mb4;
CREATE USER 'buildvalve'@'%' IDENTIFIED BY 'secret';
GRANT ALL ON buildvalve.* TO 'buildvalve'@'%';
```

#### Multi-instance cleanup ownership

BuildValve runs two periodic cleanup jobs against the shared DB:

- **Expired session sweep** — every 15 minutes, deletes rows whose `expires` is in the past (`bv_sessions` on MySQL, `sessions` on SQLite; Redis sessions expire via native TTL; DynamoDB uses native TTL on the `ttl` attribute).
- **Triggered-runs prune** — every 24 hours, drops history entries older than 90 days (90-day retention).

By default every instance runs them. When you scale to **multiple BuildValve replicas behind a load balancer against a shared Redis or MySQL backend**, that means every replica is issuing the same DELETEs against the same rows — wasted work and a small race window. Pick one replica to own cleanup and disable it on the rest:

```yaml
# On the elected "cleanup owner" replica (or just leave the flag off — true is the default):
storage:
  type: mysql
  mysql_url: mysql://...
  run_cleanup_crons: true

# On all other replicas:
storage:
  type: mysql
  mysql_url: mysql://...
  run_cleanup_crons: false
```

The flag has no effect on **DynamoDB** (cleanup is server-side via TTL — no app cron runs) and is irrelevant for **SQLite** (single-writer only, so by definition one instance). Set it on **Redis** and **MySQL** deployments with more than one replica.

### Notes

The legacy `gitlab:` top-level config block from v0.2.x is no longer supported. Use `ci_providers[]` instead. Numeric project IDs are auto-converted to strings.

---

## Auth Providers

BuildValve supports multiple auth providers. You can enable any combination — the login page renders a button for each OAuth/SSO provider and a form for local accounts.

### SAML 2.0 (Okta, Azure AD, Keycloak, ADFS)

```yaml
auth:
  providers:
    - type: saml
      enabled: true
      label: "Company SSO"
      entry_point: https://idp.example.com/sso/saml
      issuer: https://buildvalve.example.com
      callback_url: https://buildvalve.example.com/api/auth/saml/callback
      cert: |
        MIICpDCCAYwCCQDU+pQ4pHgSp...
      attribute_mapping:
        email: http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress
        groups: http://schemas.xmlsoap.org/claims/Group
```

1. Register BuildValve as a SAML Service Provider in your IdP
2. Set the **ACS URL** (callback) to: `https://your-buildvalve-host/api/auth/saml/callback`
3. Set the **Entity ID** (issuer) to: `https://your-buildvalve-host`
4. Download your IdP's public certificate and paste it under `cert:`
5. Configure `attribute_mapping` to match the claim names your IdP sends for email and groups

To get the SP metadata XML (useful for IdP setup): `GET /api/auth/saml/metadata`

### GitHub

Create an OAuth App at **GitHub > Settings > Developer settings > OAuth Apps**.

```yaml
auth:
  providers:
    - type: github
      enabled: true
      label: "GitHub"
      client_id: "your-github-client-id"
      client_secret: "your-github-client-secret"
      callback_url: https://buildvalve.example.com/api/auth/github/callback  # optional, auto-detected
```

Set the callback URL in your GitHub OAuth App to `https://your-host/api/auth/github/callback`.

### Google

Create credentials at **Google Cloud Console > APIs & Services > Credentials > OAuth 2.0 Client IDs**.

```yaml
auth:
  providers:
    - type: google
      enabled: true
      label: "Google"
      client_id: "your-google-client-id"
      client_secret: "your-google-client-secret"
      callback_url: https://buildvalve.example.com/api/auth/google/callback  # optional
```

Set the authorized redirect URI in Google Cloud to `https://your-host/api/auth/google/callback`.

### GitLab

Create an application at **GitLab > User Settings > Applications** (or Admin > Applications for instance-wide).

```yaml
auth:
  providers:
    - type: gitlab
      enabled: true
      label: "GitLab"
      client_id: "your-gitlab-app-id"
      client_secret: "your-gitlab-app-secret"
      base_url: https://gitlab.example.com    # optional, defaults to https://gitlab.com
      callback_url: https://buildvalve.example.com/api/auth/gitlab/callback  # optional
```

Set the callback URL in your GitLab application to `https://your-host/api/auth/gitlab/callback`. Required scope: `read_user`.

### Local Users

Define simple username/password accounts directly in the config. Useful for small teams or environments without SSO.

Passwords are stored as **SHA-256 hex digests** — plain-text passwords are not accepted. Generate one with:

```bash
echo -n "your-password" | shasum -a 256
```

```yaml
auth:
  providers:
    - type: local
      enabled: true
      label: "Local Account"
      users:
        - email: alice@company.com
          password_sha256: "5e884898da..."
          groups: [devops-team]
```

### Mock (dev only)

```yaml
auth:
  providers:
    - type: mock
      enabled: true
      label: "Bypass Login (Dev)"
      mock_user:
        email: alice@company.com
        groups: [devops-team]
```

Mock pipelines auto-complete after ~15 seconds and reset when the server restarts.

---

## App Navigation

| Page | URL | What it does |
|------|-----|-------------|
| Pipelines | `/` | Table of all your allowed projects and pipelines |
| Launch | `/project/:id/pipeline/:name` | Fill in variables and launch a pipeline |
| Pipeline Run | `/project/:id/pipeline/:name/run/:id` | Live pipeline status and job list (SSE) |
| Job Logs | `.../run/:id/job/:id/logs` | Full-screen live-tailing job output (SSE) |
| History | `/project/:id/pipeline/:name/history` | Past executions for a pipeline |
| Profile | `/profile` | Your logged-in user info and groups |
| Admin | `/admin` | View the loaded config (admins only) |

---

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, guidelines, and how to submit a pull request.

## Security

To report a vulnerability, please see [SECURITY.md](SECURITY.md).

---

## License

Apache License 2.0. See [LICENSE.md](LICENSE.md) for details.
