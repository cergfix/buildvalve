import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthRouter } from "./auth.js";
import type { AppConfig } from "../types/index.js";
import type { AuthProvider } from "../services/auth/types.js";

vi.mock("../middleware/requireAuth.js", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    gitlab: { url: "https://gitlab.example.com", service_account_token: "tok" },
    auth: { providers: [] },
    session: { secret: "testsecret", max_age: 3600 },
    projects: [
      { id: 1, name: "P1", pipelines: [{ name: "deploy", ref: "main", variables: [] }] },
    ],
    permissions: [{ users: ["alice@co.com"], projects: [1] }],
    ...overrides,
  };
}

function makeProvider(type: string, label: string): AuthProvider {
  return {
    type,
    label,
    setupRoutes: vi.fn(),
  };
}

function mockReqRes(sessionUser?: { email: string; provider: string; groups?: string[] }) {
  const req = {
    session: {
      user: sessionUser,
      destroy: vi.fn((cb: (err?: Error) => void) => cb()),
    },
  } as any;
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    clearCookie: vi.fn(),
  } as any;
  return { req, res };
}

function findHandler(router: any, method: string, path: string) {
  const layer = (router as any).stack.find((l: any) => l.route?.path === path);
  if (!layer) throw new Error(`Route ${path} not found`);
  const methodStack = layer.route.stack.filter(
    (s: any) => s.method === method || !s.method,
  );
  // Return the last handler (skip middleware like requireAuth)
  return methodStack[methodStack.length - 1].handle;
}

describe("createAuthRouter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("GET /api/auth/providers", () => {
    it("returns provider list with correct shape", () => {
      const providers = [
        makeProvider("github", "GitHub"),
        makeProvider("local", "Local Login"),
        makeProvider("mock", "Dev Mock"),
      ];
      const router = createAuthRouter(makeConfig(), providers);
      const handler = findHandler(router, "get", "/api/auth/providers");

      const { req, res } = mockReqRes();
      handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        type: "github",
        label: "GitHub",
        buttonLabel: "Sign in with GitHub",
        loginUrl: "/api/auth/github/login",
        form: undefined,
      });
    });

    it("sets form=credentials for local provider", () => {
      const providers = [makeProvider("local", "Local Login")];
      const router = createAuthRouter(makeConfig(), providers);
      const handler = findHandler(router, "get", "/api/auth/providers");

      const { req, res } = mockReqRes();
      handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result[0].form).toBe("credentials");
    });

    it("does not set form for non-local providers", () => {
      const providers = [makeProvider("github", "GitHub"), makeProvider("saml", "Okta")];
      const router = createAuthRouter(makeConfig(), providers);
      const handler = findHandler(router, "get", "/api/auth/providers");

      const { req, res } = mockReqRes();
      handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.every((p: any) => p.form === undefined)).toBe(true);
    });
  });

  describe("GET /api/auth/me", () => {
    it("returns user, projects, isAdmin, and externalLinks", () => {
      const config = makeConfig({
        admins: ["alice@co.com"],
        external_links: [
          { label: "Grafana", url: "https://grafana.example.com" },
          { label: "Wiki", url: "https://wiki.example.com" },
        ],
      });
      const router = createAuthRouter(config, []);
      const handler = findHandler(router, "get", "/api/auth/me");

      const { req, res } = mockReqRes({ email: "alice@co.com", provider: "mock" });
      handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.user.email).toBe("alice@co.com");
      expect(result.isAdmin).toBe(true);
      expect(result.projects).toHaveLength(1);
      expect(result.externalLinks).toHaveLength(2);
      expect(result.externalLinks[0].label).toBe("Grafana");
    });

    it("returns isAdmin=false for non-admin users", () => {
      const config = makeConfig({ admins: ["admin@co.com"] });
      const router = createAuthRouter(config, []);
      const handler = findHandler(router, "get", "/api/auth/me");

      const { req, res } = mockReqRes({ email: "alice@co.com", provider: "mock" });
      handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.isAdmin).toBe(false);
    });

    it("returns empty externalLinks when not configured", () => {
      const router = createAuthRouter(makeConfig(), []);
      const handler = findHandler(router, "get", "/api/auth/me");

      const { req, res } = mockReqRes({ email: "alice@co.com", provider: "mock" });
      handler(req, res);

      const result = res.json.mock.calls[0][0];
      expect(result.externalLinks).toEqual([]);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("destroys session and returns ok", () => {
      const router = createAuthRouter(makeConfig(), []);
      const handler = findHandler(router, "post", "/api/auth/logout");

      const { req, res } = mockReqRes({ email: "alice@co.com", provider: "mock" });
      handler(req, res);

      expect(req.session.destroy).toHaveBeenCalled();
      expect(res.clearCookie).toHaveBeenCalledWith("connect.sid");
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("returns 500 on session destroy error", () => {
      const router = createAuthRouter(makeConfig(), []);
      const handler = findHandler(router, "post", "/api/auth/logout");

      const { req, res } = mockReqRes({ email: "alice@co.com", provider: "mock" });
      req.session.destroy = vi.fn((cb: (err?: Error) => void) => cb(new Error("boom")));
      handler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  it("calls setupRoutes on each provider", () => {
    const providers = [makeProvider("github", "GitHub"), makeProvider("saml", "Okta")];
    createAuthRouter(makeConfig(), providers);
    expect(providers[0].setupRoutes).toHaveBeenCalled();
    expect(providers[1].setupRoutes).toHaveBeenCalled();
  });
});
