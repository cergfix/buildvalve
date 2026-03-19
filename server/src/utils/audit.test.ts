import { describe, it, expect, vi } from "vitest";
import { audit } from "./audit.js";

vi.mock("./logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

import { logger } from "./logger.js";

describe("audit", () => {
  it("logs a structured audit entry for login", () => {
    audit({ email: "alice@co.com", provider: "local" }, "login");

    expect(logger.info).toHaveBeenCalledWith({
      audit: true,
      event: "login",
      user_email: "alice@co.com",
      user_provider: "local",
    });
  });

  it("logs a structured audit entry for pipeline_triggered with extra fields", () => {
    audit(
      { email: "bob@co.com", provider: "github" },
      "pipeline_triggered",
      { project_id: "42", pipeline_name: "Deploy", ci_pipeline_id: "999" }
    );

    expect(logger.info).toHaveBeenCalledWith({
      audit: true,
      event: "pipeline_triggered",
      user_email: "bob@co.com",
      user_provider: "github",
      project_id: "42",
      pipeline_name: "Deploy",
      ci_pipeline_id: "999",
    });
  });

  it("logs login_failed with reason", () => {
    audit({ email: "hacker@evil.com", provider: "local" }, "login_failed", { reason: "invalid_credentials" });

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        audit: true,
        event: "login_failed",
        user_email: "hacker@evil.com",
        reason: "invalid_credentials",
      })
    );
  });

  it("defaults provider to unknown when not set", () => {
    audit({ email: "x@y.com" }, "logout");

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        user_provider: "unknown",
      })
    );
  });

  it("logs all event types", () => {
    const events = [
      "login", "login_failed", "logout",
      "pipeline_triggered", "pipeline_trigger_failed",
      "pipeline_viewed", "pipeline_history_viewed",
      "job_logs_viewed", "admin_config_viewed",
    ] as const;

    for (const event of events) {
      vi.mocked(logger.info).mockClear();
      audit({ email: "test@co.com", provider: "mock" }, event);
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ audit: true, event })
      );
    }
  });
});
