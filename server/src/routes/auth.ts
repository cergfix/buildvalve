import { Router } from "express";
import type { AppConfig } from "../types/index.js";
import type { AuthProvider } from "../services/auth/types.js";
import { getAllowedProjects } from "../services/permissions.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { logger } from "../utils/logger.js";

export function createAuthRouter(config: AppConfig, providers: AuthProvider[]): Router {
  const router = Router();

  // Mount each provider's routes
  for (const provider of providers) {
    provider.setupRoutes(router);
  }

  // List available providers (for the login page to render buttons)
  router.get("/api/auth/providers", (_req, res) => {
    const available = providers.map((p) => ({
      type: p.type,
      label: p.label,
      loginUrl: `/api/auth/${p.type}/login`,
    }));
    res.json(available);
  });

  // Current user info + allowed projects
  router.get("/api/auth/me", requireAuth, (req, res) => {
    const user = req.session.user!;
    const projects = getAllowedProjects(user, config);
    const isAdmin = !!(config.admins && config.admins.includes(user.email));
    res.json({ user, projects, isAdmin });
  });

  // Logout
  router.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        logger.error("Session destroy error", { error: err });
        res.status(500).json({ error: "Logout failed" });
        return;
      }
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  return router;
}
