# Contributing to BuildValve

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

### Prerequisites

- **Node.js** >= 20 (a `.nvmrc` is included — run `nvm use` if you use [nvm](https://github.com/nvm-sh/nvm))
- **npm** (ships with Node.js)

### Setup

```bash
git clone https://github.com/cergfix/buildvalve.git
cd buildvalve
npm install
```

Copy the example config for local development:

```bash
cp config/config.yml.example config/config.yml
```

Enable mock mode in `config/config.yml` so you don't need real CI provider credentials or SSO:

```yaml
ci_providers:
  - name: default
    type: gitlab
    mock: true

auth:
  providers:
    - type: mock
      enabled: true
```

### Running locally

```bash
# Terminal 1 — backend (port 3000)
cd server && npm run dev

# Terminal 2 — frontend (port 5173)
cd client && npm run dev
```

Open http://localhost:5173 in your browser.

## Making Changes

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```

2. **Make your changes.** Follow the existing code style — the project uses TypeScript throughout.

3. **Test your changes:**
   ```bash
   # Server tests
   cd server && npm test -- --run

   # Client lint + build
   cd client && npm run lint && npm run build
   ```

4. **Commit** with a clear message describing what changed and why.

5. **Open a pull request** against `main`. Fill out the PR template.

## Project Structure

```
buildvalve/
├── server/          # Express backend (TypeScript)
├── client/          # React frontend (TypeScript + Vite)
├── config/          # Runtime config (gitignored)
└── .github/         # CI workflows and templates
```

## Guidelines

- **Never commit `config/config.yml`** — it contains secrets and is gitignored.
- **Keep PRs focused** — one feature or fix per PR makes review easier.
- **Add tests** for new server functionality when possible.
- **No unnecessary dependencies** — if the standard library or an existing dependency can do it, prefer that.

## Reporting Bugs

Use the [Bug Report](https://github.com/cergfix/buildvalve/issues/new?template=bug_report.yml) issue template. Include steps to reproduce, expected behavior, and any relevant logs or screenshots.

## Suggesting Features

Use the [Feature Request](https://github.com/cergfix/buildvalve/issues/new?template=feature_request.yml) issue template. Describe the problem you're trying to solve and your proposed solution.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE.md).
