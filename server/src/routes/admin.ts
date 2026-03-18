import { Router } from "express";
import type { AppConfig } from "../types/index.js";
import { requireAuth } from "../middleware/requireAuth.js";

export function createAdminRouter(config: AppConfig): Router {
  const router = Router();

  router.get("/api/admin/config", requireAuth, (req, res) => {
    const userEmail = req.session.user?.email;
    if (!config.admins || !config.admins.includes(userEmail!)) {
      res.status(403).json({ error: "Access denied. You must be listed in the config.yml 'admins' array." });
      return;
    }

    const safeConfig = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;

    // Redact sensitive backend information
    if ((safeConfig as any).session?.secret) (safeConfig as any).session.secret = "REDACTED";

    // Redact legacy gitlab block if present
    if ((safeConfig as any).gitlab?.service_account_token) (safeConfig as any).gitlab.service_account_token = "REDACTED";

    // Redact CI provider secrets
    if (Array.isArray((safeConfig as any).ci_providers)) {
      for (const provider of (safeConfig as any).ci_providers) {
        if (provider.token) provider.token = "REDACTED";
        if (provider.github_token) provider.github_token = "REDACTED";
        if (provider.circleci_token) provider.circleci_token = "REDACTED";
      }
    }

    // Redact per-project token overrides
    if (Array.isArray((safeConfig as any).projects)) {
      for (const project of (safeConfig as any).projects) {
        if (project.token_override) project.token_override = "REDACTED";
      }
    }

    // Redact auth provider secrets
    if ((safeConfig as any).auth?.providers) {
      for (const provider of (safeConfig as any).auth.providers) {
        if (provider.cert) provider.cert = "REDACTED";
        if (provider.client_secret) provider.client_secret = "REDACTED";
      }
    }

    res.json(safeConfig);
  });

  return router;
}
