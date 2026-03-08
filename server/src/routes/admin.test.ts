import { describe, it, expect, vi } from "vitest";
import { createAdminRouter } from "./admin.js";
import type { AppConfig } from "../types/index.js";

function makeConfig(admins?: string[]): AppConfig {
  return {
    gitlab: { url: "https://gitlab.example.com", service_account_token: "super-secret-token" },
    auth: {
      providers: [
        { type: "saml", enabled: true, label: "Okta", entry_point: "x", issuer: "x", callback_url: "x", cert: "CERT-DATA" } as any,
      ],
    },
    session: { secret: "my-session-secret", max_age: 3600 },
    projects: [],
    permissions: [],
    admins,
  };
}

function mockReqRes(email: string) {
  const req = { session: { user: { email, username: "test", provider: "mock" } } } as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
  return { req, res };
}

describe("admin config endpoint", () => {
  it("returns 403 for non-admin user", () => {
    const config = makeConfig(["admin@co.com"]);
    const router = createAdminRouter(config);

    // Find the /api/admin/config handler (second layer after requireAuth)
    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === "/api/admin/config"
    );
    const handler = layer.route.stack[0].handle;

    const { req, res } = mockReqRes("nobody@co.com");
    handler(req, res);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it("redacts sensitive fields for admin user", () => {
    const config = makeConfig(["admin@co.com"]);
    const router = createAdminRouter(config);

    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === "/api/admin/config"
    );
    const handler = layer.route.stack[0].handle;

    const { req, res } = mockReqRes("admin@co.com");
    handler(req, res);

    const returnedConfig = res.json.mock.calls[0][0];
    expect(returnedConfig.session.secret).toBe("REDACTED");
    expect(returnedConfig.gitlab.service_account_token).toBe("REDACTED");
    expect(returnedConfig.auth.providers[0].cert).toBe("REDACTED");
  });

  it("does not mutate the original config", () => {
    const config = makeConfig(["admin@co.com"]);
    const router = createAdminRouter(config);

    const layer = (router as any).stack.find(
      (l: any) => l.route?.path === "/api/admin/config"
    );
    const handler = layer.route.stack[0].handle;

    const { req, res } = mockReqRes("admin@co.com");
    handler(req, res);

    expect(config.session.secret).toBe("my-session-secret");
    expect(config.gitlab.service_account_token).toBe("super-secret-token");
  });
});
