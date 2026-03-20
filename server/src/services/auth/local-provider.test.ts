import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";
import type { AppConfig, LocalProviderConfig } from "../../types/index.js";

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function makeAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ci_providers: [{ name: "default", type: "gitlab", url: "https://gitlab.example.com", token: "tok" }],
    auth: { providers: [] },
    session: { secret: "testsecret", max_age: 3600 },
    projects: [],
    permissions: [
      { users: ["alice@company.com", "bob@company.com"], projects: ["1"] },
      { groups: ["devops"], projects: ["2"] },
    ],
    ...overrides,
  };
}

function makeLocalConfig(overrides: Partial<LocalProviderConfig> = {}): LocalProviderConfig {
  return {
    type: "local",
    enabled: true,
    label: "Local Login",
    users: [
      { email: "alice@company.com", password: "secret123", groups: ["devops"] },
      { email: "bob@company.com", password_hash: sha256("hashed-pw"), groups: [] },
    ],
    ...overrides,
  };
}

function mockReqRes(body: Record<string, unknown> = {}) {
  const req = {
    body,
    session: {
      user: undefined as unknown,
      id: "sess-123",
      save: vi.fn((cb: (err?: Error) => void) => cb()),
    },
  } as any;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    redirect: vi.fn(),
  } as any;
  return { req, res };
}

async function importAndSetup(
  localConfig?: LocalProviderConfig,
  appConfig?: AppConfig,
) {
  const { LocalProvider } = await import("./local-provider.js");
  const { Router } = await import("express");

  const lc = localConfig ?? makeLocalConfig();
  const ac = appConfig ?? makeAppConfig();
  const provider = new LocalProvider(lc, ac);
  const router = Router();
  provider.setupRoutes(router);

  // Find the POST /api/auth/local/login handler
  const layer = (router as any).stack.find(
    (l: any) => l.route?.path === "/api/auth/local/login",
  );
  const handler = layer.route.stack[0].handle;
  return { provider, handler };
}

describe("LocalProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("uses config label", async () => {
      const { provider } = await importAndSetup(makeLocalConfig({ label: "Corporate" }));
      expect(provider.label).toBe("Corporate");
    });

    it("defaults label when not provided", async () => {
      const config = makeLocalConfig();
      delete (config as any).label;
      config.label = "";
      // The constructor uses || so empty string falls back
      const { LocalProvider } = await import("./local-provider.js");
      const p = new LocalProvider({ ...config, label: "" } as any, makeAppConfig());
      expect(p.label).toBe("Local Login");
    });
  });

  describe("POST /api/auth/local/login", () => {
    it("returns 400 when email is missing", async () => {
      const { handler } = await importAndSetup();
      const { req, res } = mockReqRes({ password: "secret123" });
      handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: "Email and password are required" });
    });

    it("returns 400 when password is missing", async () => {
      const { handler } = await importAndSetup();
      const { req, res } = mockReqRes({ email: "alice@company.com" });
      handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 400 when both fields are missing", async () => {
      const { handler } = await importAndSetup();
      const { req, res } = mockReqRes({});
      handler(req, res);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns 401 for non-existent user", async () => {
      const { handler } = await importAndSetup();
      const { req, res } = mockReqRes({ email: "nobody@company.com", password: "pass" });
      handler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid email or password" });
    });

    it("returns 401 for wrong password (plaintext)", async () => {
      const { handler } = await importAndSetup();
      const { req, res } = mockReqRes({ email: "alice@company.com", password: "wrong" });
      handler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("returns 401 for wrong password (hash)", async () => {
      const { handler } = await importAndSetup();
      const { req, res } = mockReqRes({ email: "bob@company.com", password: "wrong" });
      handler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("authenticates user with correct plaintext password", async () => {
      const { handler } = await importAndSetup();
      const { req, res } = mockReqRes({ email: "alice@company.com", password: "secret123" });
      handler(req, res);
      expect(req.session.user).toEqual({
        email: "alice@company.com",
        provider: "local",
        groups: ["devops"],
      });
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("authenticates user with correct hashed password", async () => {
      const { handler } = await importAndSetup();
      const { req, res } = mockReqRes({ email: "bob@company.com", password: "hashed-pw" });
      handler(req, res);
      expect(req.session.user).toEqual({
        email: "bob@company.com",
        provider: "local",
        groups: [],
      });
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("returns 403 when user has no permission rules", async () => {
      const appConfig = makeAppConfig({ permissions: [] });
      const { handler } = await importAndSetup(undefined, appConfig);
      const { req, res } = mockReqRes({ email: "alice@company.com", password: "secret123" });
      handler(req, res);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Access denied" });
    });

    it("grants access via group-based permission", async () => {
      const appConfig = makeAppConfig({
        permissions: [{ groups: ["devops"], projects: ["1"] }],
      });
      const { handler } = await importAndSetup(undefined, appConfig);
      const { req, res } = mockReqRes({ email: "alice@company.com", password: "secret123" });
      handler(req, res);
      expect(res.json).toHaveBeenCalledWith({ ok: true });
    });

    it("returns 500 when session save fails", async () => {
      const { handler } = await importAndSetup();
      const { req, res } = mockReqRes({ email: "alice@company.com", password: "secret123" });
      req.session.save = vi.fn((cb: (err?: Error) => void) => cb(new Error("Redis down")));
      handler(req, res);
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({ error: "Session error" });
    });

    it("handles config with no users array", async () => {
      const localConfig = makeLocalConfig({ users: undefined });
      const { handler } = await importAndSetup(localConfig);
      const { req, res } = mockReqRes({ email: "alice@company.com", password: "secret123" });
      handler(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
