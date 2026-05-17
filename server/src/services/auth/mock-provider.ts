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
      // Slam the requested mock user into the session
      req.session.user = {
        email: this.config.mock_user.email,
        provider: "mock",
        groups: this.config.mock_user.groups || [],
      };

      // In split deployments the SPA lives on a different origin than the API,
      // so a bare `res.redirect("/")` would land the browser on the API host
      // (which doesn't serve HTML). Bounce back to the SPA's origin if we can
      // tell it apart from the API origin via the Referer header.
      let target = "/";
      const referer = req.get("referer");
      if (referer) {
        try {
          const url = new URL(referer);
          if (url.host !== req.get("host")) {
            target = `${url.protocol}//${url.host}/`;
          }
        } catch { /* keep default "/" */ }
      }

      req.session.save((err) => {
        if (err) console.error("Session mock save error", err);
        res.redirect(target);
      });
    });
  }
}
