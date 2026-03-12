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
import { GitLabService } from "./services/gitlab.js";
import { MockGitLabService } from "./services/mock-gitlab.js";
import { createAuthRouter } from "./routes/auth.js";
import { createPipelineRouter } from "./routes/pipelines.js";
import { createAdminRouter } from "./routes/admin.js";
import type { SamlProviderConfig, MockProviderConfig } from "./types/index.js";
import { MockProvider } from "./services/auth/mock-provider.js";
import { logger } from "./utils/logger.js";

const configPath = process.env.CONFIG_PATH;
const config = loadConfig(configPath);

logger.info(`Loaded config: ${config.projects.length} projects, ${config.permissions.length} permission rules`);

// Init auth providers
for (const providerConfig of config.auth.providers) {
  if (!providerConfig.enabled) continue;

  if (providerConfig.type === "saml") {
    const provider = new SamlProvider(providerConfig as SamlProviderConfig, config);
    registerProvider(provider);
    logger.info(`Auth provider registered: ${providerConfig.label} (${providerConfig.type})`);
  } else if (providerConfig.type === "mock") {
    const provider = new MockProvider(providerConfig as MockProviderConfig);
    registerProvider(provider);
    logger.info(`Auth provider registered: ${providerConfig.label} (${providerConfig.type})`);
  } else {
    logger.warn(`Unknown auth provider type: ${providerConfig.type} — skipping`);
  }
}

const providers = getAllProviders();
if (providers.length === 0) {
  throw new Error("No auth providers enabled. Check config.yml auth.providers.");
}

// Init GitLab service
const gitlab = config.gitlab.mock
  ? new MockGitLabService()
  : new GitLabService(config.gitlab.url, config.gitlab.service_account_token);

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
app.use(createPipelineRouter(config, gitlab));
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
