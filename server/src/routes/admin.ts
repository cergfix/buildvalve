import { Router } from "express";
import type { AppConfig } from "../types/index.js";
import { requireAuth } from "../middleware/requireAuth.js";

// Optional: you can add an isAdmin() check here based on groups if needed in the future
export function createAdminRouter(config: AppConfig): Router {
  const router = Router();

  // Read-only view of the current loaded backend configuration
  // Be careful: we should hide the session secret, service account token,
  // SAML cert, Client Secret etc. before sending to the client!
  router.get("/api/admin/config", requireAuth, (req, res) => {
    // Check if user is an admin
    const userEmail = req.session.user?.email;
    if (!config.admins || !config.admins.includes(userEmail!)) {
      res.status(403).json({ error: "Access denied. You must be listed in the config.yml 'admins' array." });
      return;
    }

    // Deep clone config to avoid mutating the live object
    const safeConfig = JSON.parse(JSON.stringify(config)) as any;

    // Redact sensitive backend information
    if (safeConfig.session?.secret) safeConfig.session.secret = "REDACTED";
    if (safeConfig.gitlab?.service_account_token) safeConfig.gitlab.service_account_token = "REDACTED";
    
    if (safeConfig.auth?.providers) {
      for (const provider of safeConfig.auth.providers) {
        if (provider.cert) provider.cert = "REDACTED";
        if (provider.client_secret) provider.client_secret = "REDACTED";
      }
    }

    res.json(safeConfig);
  });

  return router;
}
