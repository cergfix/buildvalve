import type { Router } from "express";
import type { AuthProvider } from "./types.js";
import type { MockProviderConfig } from "../../types/index.js";

export class MockProvider implements AuthProvider {
  type = "mock";
  label: string;
  private config: MockProviderConfig;

  constructor(config: MockProviderConfig) {
    this.label = config.label || "Mock Login";
    this.config = config;
  }

  setupRoutes(router: Router): void {
    router.get(`/api/auth/${this.type}/login`, (req, res) => {
      // Simply slam the requested mock user into the session
      req.session.user = {
        email: this.config.mock_user.email,
        username: this.config.mock_user.username,
        provider: "mock",
        groups: this.config.mock_user.groups || [],
      };
      
      // Save the session and redirect to frontend
      req.session.save((err) => {
        if (err) console.error("Session mock save error", err);
        res.redirect("/");
      });
    });
  }
}
