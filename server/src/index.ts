import "dotenv/config";
import path from "node:path";
import { existsSync } from "node:fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import passport from "passport";
import { loadConfig } from "./config.js";
import { createSessionMiddleware } from "./middleware/session.js";
import { SamlProvider } from "./services/auth/saml-provider.js";
import { registerProvider, getAllProviders } from "./services/auth/index.js";
import { registerCIProvider } from "./services/ci/index.js";
import { GitLabProvider } from "./services/ci/gitlab-provider.js";
import { GitHubActionsProvider } from "./services/ci/github-actions-provider.js";
import { CircleCIProvider } from "./services/ci/circleci-provider.js";
import { MockCIProvider } from "./services/ci/mock-provider.js";
import { createAuthRouter } from "./routes/auth.js";
import { createPipelineRouter } from "./routes/pipelines.js";
import { createAdminRouter } from "./routes/admin.js";
import type { SamlProviderConfig, OAuthProviderConfig, LocalProviderConfig, MockProviderConfig } from "./types/index.js";
import { OAuthProvider } from "./services/auth/oauth-provider.js";
import { LocalProvider } from "./services/auth/local-provider.js";
import { MockProvider } from "./services/auth/mock-provider.js";
import { logger } from "./utils/logger.js";

const configPath = process.env.CONFIG_PATH;
const config = loadConfig(configPath);

logger.info(`Loaded config: ${config.projects.length} projects, ${config.permissions.length} permission rules, ${config.ci_providers.length} CI providers`);

// Init auth providers
for (const providerConfig of config.auth.providers) {
  if (!providerConfig.enabled) continue;

  if (providerConfig.type === "saml") {
    const provider = new SamlProvider(providerConfig as SamlProviderConfig, config);
    registerProvider(provider);
  } else if (providerConfig.type === "github" || providerConfig.type === "google" || providerConfig.type === "gitlab") {
    const provider = new OAuthProvider(providerConfig as OAuthProviderConfig, config);
    registerProvider(provider);
  } else if (providerConfig.type === "local") {
    const provider = new LocalProvider(providerConfig as LocalProviderConfig, config);
    registerProvider(provider);
  } else if (providerConfig.type === "mock") {
    const provider = new MockProvider(providerConfig as MockProviderConfig);
    registerProvider(provider);
  } else {
    logger.warn(`Unknown auth provider type: ${providerConfig.type} — skipping`);
    continue;
  }
  logger.info(`Auth provider registered: ${providerConfig.label} (${providerConfig.type})`);
}

const providers = getAllProviders();
if (providers.length === 0) {
  throw new Error("No auth providers enabled. Check config.yml auth.providers.");
}

// Init CI providers
for (const providerConfig of config.ci_providers) {
  if (providerConfig.mock) {
    registerCIProvider(new MockCIProvider(providerConfig.name, providerConfig.type));
  } else {
    switch (providerConfig.type) {
      case "gitlab":
        if (!providerConfig.url || !providerConfig.token) {
          throw new Error(`GitLab CI provider "${providerConfig.name}" requires url and token`);
        }
        registerCIProvider(new GitLabProvider(providerConfig.name, providerConfig.url, providerConfig.token));
        break;
      case "github-actions":
        if (!providerConfig.github_token) {
          throw new Error(`GitHub Actions CI provider "${providerConfig.name}" requires github_token`);
        }
        registerCIProvider(new GitHubActionsProvider(providerConfig.name, providerConfig.github_token, providerConfig.github_api_url));
        break;
      case "circleci":
        if (!providerConfig.circleci_token) {
          throw new Error(`CircleCI CI provider "${providerConfig.name}" requires circleci_token`);
        }
        registerCIProvider(new CircleCIProvider(providerConfig.name, providerConfig.circleci_token, providerConfig.circleci_api_url));
        break;
      default:
        logger.warn(`Unknown CI provider type: ${providerConfig.type} — skipping`);
        continue;
    }
  }
  logger.info(`CI provider registered: ${providerConfig.name} (${providerConfig.type}${providerConfig.mock ? ", mock" : ""})`);
}

// Handle per-project token overrides: create override provider instances
for (const project of config.projects) {
  if (!project.token_override) continue;

  const baseProvider = config.ci_providers.find((p) => p.name === project.provider);
  if (!baseProvider) continue;

  const overrideName = `${project.provider}::${project.id}`;

  if (baseProvider.mock) {
    registerCIProvider(new MockCIProvider(overrideName, baseProvider.type));
  } else {
    switch (baseProvider.type) {
      case "gitlab":
        registerCIProvider(new GitLabProvider(overrideName, baseProvider.url!, project.token_override));
        break;
      case "github-actions":
        registerCIProvider(new GitHubActionsProvider(overrideName, project.token_override, baseProvider.github_api_url));
        break;
      case "circleci":
        registerCIProvider(new CircleCIProvider(overrideName, project.token_override, baseProvider.circleci_api_url));
        break;
    }
  }

  // Point this project to the override provider
  (project as { provider: string }).provider = overrideName;
  logger.info(`Token override registered for project "${project.name}" -> ${overrideName}`);
}

// Express app
const app = express();

app.use(
  helmet({
    contentSecurityPolicy:
      process.env.NODE_ENV === "development" ? false : undefined,
  })
);
app.use(morgan("short"));
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? true,
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // needed for SAML POST callback
app.use(createSessionMiddleware(config));
app.use(passport.initialize());

// Health check (before auth-protected routers)
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", providers: providers.map((p) => p.type) });
});

// Serve client SPA static assets (before auth-protected routers so they don't intercept non-API requests)
const clientDir = path.resolve(import.meta.dirname, "../../client/dist");
if (existsSync(clientDir)) {
  app.use(express.static(clientDir));
  logger.info(`Serving client SPA from ${clientDir}`);
}

// Routes
app.use(createAuthRouter(config, providers));
app.use(createPipelineRouter(config));
app.use(createAdminRouter(config));

// SPA fallback — serves index.html for non-API routes (client-side routing)
if (existsSync(clientDir)) {
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });
}

// Start
const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  logger.info(`Server listening on port ${port}`);
});
