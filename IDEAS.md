# Feature Ideas

## Pipeline execution
- **Pipeline scheduling** — cron-like recurring triggers (e.g. nightly deploys)
- **Pipeline chaining** — trigger pipeline B after pipeline A succeeds, across providers
- **Bulk trigger** — launch the same pipeline across multiple projects at once (e.g. deploy all services)
- **Pipeline approval gates** — require a second user to approve before trigger executes
- **Rollback shortcut** — one-click re-trigger of the last successful pipeline with same variables
- **Variable presets** — saved sets of variable values (e.g. "staging-us-east", "prod-eu-west")

## Observability
- **Audit log** — persistent record of who triggered what, when, with which variables
- **Pipeline duration tracking** — historical charts of pipeline execution time
- **Notifications** — Slack/email/webhook alerts on pipeline success/failure
- **Status dashboard** — aggregated health view across all projects (last deploy status, how long ago)

## Access control
- **Per-pipeline permissions** — currently permissions are per-project; allow restricting specific pipelines (e.g. only devops can trigger prod deploy)
- **RBAC roles** — viewer (see status only), operator (trigger), admin (configure)
- **Approval workflows** — "request to deploy" that another user must approve

## Configuration
- **Config UI** — edit projects/pipelines/providers through the admin panel instead of YAML only
- **Secret management** — store tokens encrypted in DB instead of plaintext in config
- **Dynamic variables** — dropdowns populated from an API (e.g. list of Docker tags from a registry, list of branches from git)
- **Environment promotion** — define a pipeline chain like staging → canary → production with variable inheritance

## UX
- **Favorites/pinning** — pin frequently used pipelines to the top
- **Dark mode toggle** — the CSS supports it but there's no user toggle
- **Real-time updates via WebSocket** — replace polling with push for pipeline status and logs
- **Mobile-responsive layout** — the sidebar doesn't collapse well on small screens
- **Keyboard shortcuts** — quick-launch pipelines with hotkeys

## Integrations
- **Jenkins provider** — another common CI system
- **Webhook receiver** — accept incoming webhooks to update pipeline status in real-time
- **Terraform/Ansible trigger** — extend beyond CI to infrastructure automation
- **API tokens** — allow headless/programmatic triggers without browser session (for chatbots, CLI tools)
