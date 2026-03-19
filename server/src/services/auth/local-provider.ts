import { createHash } from "node:crypto";
import type { Router } from "express";
import type { AuthProvider } from "./types.js";
import type { LocalProviderConfig, AppConfig } from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { audit } from "../../utils/audit.js";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export class LocalProvider implements AuthProvider {
  type = "local";
  label: string;
  private config: LocalProviderConfig;
  private appConfig: AppConfig;

  constructor(config: LocalProviderConfig, appConfig: AppConfig) {
    this.label = config.label || "Local Login";
    this.config = config;
    this.appConfig = appConfig;
  }

  setupRoutes(router: Router): void {
    // POST /api/auth/local/login  { email, password }
    router.post("/api/auth/local/login", (req, res) => {
      const { email, password } = req.body as { email?: string; password?: string };

      if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
      }

      const matchedUser = (this.config.users ?? []).find((u) => {
        if (u.email !== email) return false;
        if (u.password_hash) {
          return sha256(password) === u.password_hash;
        }
        return u.password === password;
      });

      if (!matchedUser) {
        audit({ email, provider: "local" }, "login_failed", { reason: "invalid_credentials" });
        return res.status(401).json({ error: "Invalid email or password" });
      }

      const user = {
        email: matchedUser.email,
        provider: "local",
        groups: matchedUser.groups ?? [],
      };

      // Check permissions
      const hasAccess = this.appConfig.permissions.some((rule) => {
        if (rule.users?.includes(user.email)) return true;
        if (rule.groups && user.groups) {
          return rule.groups.some((g) => user.groups!.includes(g));
        }
        return false;
      });

      if (!hasAccess) {
        audit(user, "login_failed", { reason: "access_denied" });
        return res.status(403).json({ error: "Access denied" });
      }

      req.session.user = user;
      req.session.save((err) => {
        if (err) {
          logger.error("Local auth session save error", { error: err });
          return res.status(500).json({ error: "Session error" });
        }
        audit(user, "login");
        return res.json({ ok: true });
      });
    });
  }
}
