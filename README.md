# BuildValve 🚀

[![CI](https://github.com/cergfix/buildvalve/actions/workflows/ci.yml/badge.svg)](https://github.com/cergfix/buildvalve/actions/workflows/ci.yml)

**A self-hosted, team-friendly GitLab pipeline launcher.**

![BuildValve Preview](preview.png)

BuildValve lets you give your team a simple dashboard of big "Launch" buttons for their most-used GitLab pipelines — without handing out Developer access, exposing raw CI variables, or forcing everyone to learn the GitLab UI.

You configure which pipelines are available and who can trigger them. Your team logs in via your company's SSO and simply clicks **Launch**.

---

## Why BuildValve?

- **No GitLab accounts needed for users** — a single service account token handles all GitLab API calls.
- **Safe variable pre-filling** — lock sensitive variables server-side so users can't override them.
- **Audit-ready** — every pipeline trigger is logged with the user's email.
- **SSO-native** — integrates with SAML 2.0 (Okta, Azure AD, Keycloak, ADFS, etc.).
- **Live monitoring** — watch job status, tail live logs, and browse execution history without leaving the app.

---

## Quick Start with Docker

The fastest way to run BuildValve. No Node.js installation required.

**1. Create a config file** (`config.yml`):

```yaml
gitlab:
  url: https://gitlab.example.com
  service_account_token: glpat-xxxxxxxxxxxx
  mock: false

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
    projects: [42]

projects:
  - id: 42
    name: "My App"
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

A ready-made dev config with mock auth and mock GitLab is included in the `dev/` directory. One command to go from zero to a running dashboard:

```bash
./dev/start.sh
```

This builds a derived Docker image from `dev/Dockerfile` (which copies `dev/config.yml` into the base image) and runs it with:
- **Mock auth** — click "Bypass Login (Dev)" to sign in as `alice@company.com`
- **Mock GitLab** — pipeline triggers are simulated in-memory and auto-complete after ~15 seconds

Open **http://localhost:3000** and click the login button.

> You can edit `dev/config.yml` to add more projects or change the mock user — re-run `./dev/start.sh` to rebuild.

---

## Build from Source

### Requirements

- **Node.js** ≥ 22 (use `nvm use` if you have [nvm](https://github.com/nvm-sh/nvm) installed — a `.nvmrc` is included)
- A **GitLab service account token** (`glpat-*`) with Developer access to the projects you want to expose
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

## Configuration

All configuration lives in **`config/config.yml`**. This file is gitignored — never commit it, as it contains secrets.

### Minimal example (development)

```yaml
gitlab:
  url: https://gitlab.example.com
  service_account_token: glpat-xxxxxxxxxxxx
  mock: true                  # Use mock GitLab — no real API calls

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
  max_age: 86400              # Session duration in seconds (86400 = 24 hours)

admins:
  - alice@company.com         # Users who can view the Admin Settings page

permissions:
  - users: [alice@company.com]
    projects: [42]

projects:
  - id: 42                    # Your GitLab project ID
    name: "My App"
    description: "Main service"
    pipelines:
      - name: "Deploy to Staging"
        ref: staging
        variables:
          - key: ENVIRONMENT
            value: staging
            locked: true      # Users cannot change this
          - key: VERSION
            value: ""
            locked: false
            required: true
            description: "Docker image tag to deploy"
```

### Full production example (SAML)

```yaml
gitlab:
  url: https://gitlab.example.com
  service_account_token: glpat-xxxxxxxxxxxx
  mock: false

auth:
  providers:
    - type: saml
      enabled: true
      label: "Company SSO"
      entry_point: https://idp.example.com/sso/saml
      issuer: https://buildvalve.example.com
      callback_url: https://buildvalve.example.com/api/auth/saml/callback
      cert: |
        MIICpDCCAYwCCQDU+pQ4pHgSp...    # Your IdP's public cert
      attribute_mapping:
        email: http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress
        groups: http://schemas.xmlsoap.org/claims/Group

session:
  secret: a-long-random-secret-change-this
  max_age: 28800              # 8 hours

admins:
  - platform@example.com

permissions:
  - groups: [devops-team]     # Everyone in this SAML group can trigger...
    projects: [42, 55]        # ...these GitLab projects

  - users: [charlie@example.com]  # Or grant individual users
    projects: [42]

projects:
  - id: 42
    name: "Backend API"
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
            required: true
            description: "Docker image tag to deploy"

      - name: "Deploy to Production"
        ref: main
        variables:
          - key: ENVIRONMENT
            value: production
            locked: true
          - key: VERSION
            value: ""
            locked: false
            required: true
            description: "Docker image tag to deploy"
          - key: DRY_RUN
            value: "true"
            locked: false
            required: false
            description: "Simulate the deploy without applying changes"

  - id: 55
    name: "Frontend App"
    description: "Customer-facing SPA"
    pipelines:
      - name: "Build & Deploy"
        ref: main
        variables: []
```

### Configuration reference

| Key | Required | Description |
|-----|----------|-------------|
| `gitlab.url` | ✅ | Base URL of your GitLab instance |
| `gitlab.service_account_token` | ✅ | `glpat-*` token with Developer access |
| `gitlab.mock` | | `true` to use in-memory mock (no real GitLab calls, dev only) |
| `session.secret` | ✅ | Random string for signing session cookies |
| `session.max_age` | | Session duration in seconds (default: 86400) |
| `admins` | | List of emails that can view the Admin Settings page |
| `auth.providers` | ✅ | At least one enabled auth provider (`saml`, `github`, `google`, `gitlab`, `local`, `mock`) |
| `permissions` | ✅ | Who can trigger which projects |
| `projects` | ✅ | Project and pipeline definitions |

### Variable options

| Field | Description |
|-------|-------------|
| `key` | CI variable name |
| `value` | Default value (can be empty string) |
| `locked` | If `true`, value is injected server-side and never sent to the browser |
| `required` | If `true`, user must provide a value before launching |
| `description` | Help text shown in the launch form |

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

```yaml
auth:
  providers:
    - type: local
      enabled: true
      label: "Local Account"
      users:
        - email: alice@company.com
          username: alice
          password: changeme             # plain text (dev only)
          groups: [devops-team]

        - email: bob@company.com
          username: bob
          password_hash: "5e884898da..."  # sha256 hex digest of password
          groups: [devops-team]
```

For production, use `password_hash` (SHA-256 hex digest) instead of `password`:
```bash
echo -n "your-password" | shasum -a 256
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
| Dashboard | `/` | Table of all your allowed projects and pipelines |
| Launch | `/project/:id/pipeline/:name` | Fill in variables and launch a pipeline |
| Pipeline Run | `/project/:id/pipeline/:name/run/:id` | Live pipeline status and job list |
| Job Logs | `…/run/:id/job/:id/logs` | Full-screen live-tailing job output |
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
