import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppConfig, OAuthProviderConfig } from "../../types/index.js";

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

function makeAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ci_providers: [{ name: "default", type: "gitlab", url: "https://gitlab.example.com", token: "tok" }],
    auth: { providers: [] },
    session: { secret: "testsecret", max_age: 3600 },
    projects: [],
    permissions: [{ users: ["user@github.com"], projects: ["1"] }],
    ...overrides,
  };
}

function makeOAuthConfig(
  type: "github" | "google" | "gitlab" = "github",
  overrides: Partial<OAuthProviderConfig> = {},
): OAuthProviderConfig {
  return {
    type,
    enabled: true,
    label: `${type.charAt(0).toUpperCase() + type.slice(1)} SSO`,
    client_id: "test-client-id",
    client_secret: "test-client-secret",
    ...overrides,
  };
}

function mockReqRes(query: Record<string, string> = {}, sessionId = "sess-123") {
  const req = {
    query,
    protocol: "https",
    get: vi.fn((name: string) => (name === "host" ? "app.example.com" : "")),
    session: {
      id: sessionId,
      user: undefined as unknown,
      save: vi.fn((cb: (err?: Error) => void) => cb()),
    },
  } as any;
  const res = {
    redirect: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as any;
  return { req, res };
}

async function setupProvider(
  type: "github" | "google" | "gitlab" = "github",
  oauthOverrides: Partial<OAuthProviderConfig> = {},
  appOverrides: Partial<AppConfig> = {},
) {
  const { OAuthProvider } = await import("./oauth-provider.js");
  const { Router } = await import("express");

  const oauthConfig = makeOAuthConfig(type, oauthOverrides);
  const appConfig = makeAppConfig(appOverrides);
  const provider = new OAuthProvider(oauthConfig, appConfig);
  const router = Router();
  provider.setupRoutes(router);

  const loginLayer = (router as any).stack.find(
    (l: any) => l.route?.path === `/api/auth/${type}/login`,
  );
  const callbackLayer = (router as any).stack.find(
    (l: any) => l.route?.path === `/api/auth/${type}/callback`,
  );

  return {
    provider,
    loginHandler: loginLayer?.route.stack[0].handle,
    callbackHandler: callbackLayer?.route.stack[0].handle,
  };
}

describe("OAuthProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("sets type and label from config", async () => {
      const { provider } = await setupProvider("github", { label: "GitHub Corp" });
      expect(provider.type).toBe("github");
      expect(provider.label).toBe("GitHub Corp");
    });
  });

  describe("GET /api/auth/{type}/login", () => {
    it("redirects to GitHub authorize URL with correct params", async () => {
      const { loginHandler } = await setupProvider("github");
      const { req, res } = mockReqRes();
      loginHandler(req, res);

      expect(res.redirect).toHaveBeenCalledTimes(1);
      const url = new URL(res.redirect.mock.calls[0][0]);
      expect(url.origin).toBe("https://github.com");
      expect(url.pathname).toBe("/login/oauth/authorize");
      expect(url.searchParams.get("client_id")).toBe("test-client-id");
      expect(url.searchParams.get("scope")).toBe("user:email");
      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("state")).toBe("sess-123");
    });

    it("redirects to Google authorize URL with access_type", async () => {
      const { loginHandler } = await setupProvider("google");
      const { req, res } = mockReqRes();
      loginHandler(req, res);

      const url = new URL(res.redirect.mock.calls[0][0]);
      expect(url.origin).toBe("https://accounts.google.com");
      expect(url.searchParams.get("access_type")).toBe("online");
      expect(url.searchParams.get("scope")).toBe("email profile");
    });

    it("redirects to self-hosted GitLab URL", async () => {
      const { loginHandler } = await setupProvider("gitlab", {
        base_url: "https://git.corp.com",
      });
      const { req, res } = mockReqRes();
      loginHandler(req, res);

      const url = new URL(res.redirect.mock.calls[0][0]);
      expect(url.origin).toBe("https://git.corp.com");
      expect(url.pathname).toBe("/oauth/authorize");
    });

    it("defaults GitLab to gitlab.com when no base_url", async () => {
      const { loginHandler } = await setupProvider("gitlab");
      const { req, res } = mockReqRes();
      loginHandler(req, res);

      const url = new URL(res.redirect.mock.calls[0][0]);
      expect(url.origin).toBe("https://gitlab.com");
    });

    it("uses callback_url from config when provided", async () => {
      const { loginHandler } = await setupProvider("github", {
        callback_url: "https://custom.example.com/cb",
      });
      const { req, res } = mockReqRes();
      loginHandler(req, res);

      const url = new URL(res.redirect.mock.calls[0][0]);
      expect(url.searchParams.get("redirect_uri")).toBe("https://custom.example.com/cb");
    });

    it("builds callback_url from request when not in config", async () => {
      const { loginHandler } = await setupProvider("github");
      const { req, res } = mockReqRes();
      loginHandler(req, res);

      const url = new URL(res.redirect.mock.calls[0][0]);
      expect(url.searchParams.get("redirect_uri")).toBe(
        "https://app.example.com/api/auth/github/callback",
      );
    });

    it("uses custom scopes when provided", async () => {
      const { loginHandler } = await setupProvider("github", { scopes: "read:user read:org" });
      const { req, res } = mockReqRes();
      loginHandler(req, res);

      const url = new URL(res.redirect.mock.calls[0][0]);
      expect(url.searchParams.get("scope")).toBe("read:user read:org");
    });
  });

  describe("GET /api/auth/{type}/callback", () => {
    it("redirects to /login?error=oauth_denied when error is present", async () => {
      const { callbackHandler } = await setupProvider("github");
      const { req, res } = mockReqRes({ error: "access_denied" });
      await callbackHandler(req, res);
      expect(res.redirect).toHaveBeenCalledWith("/login?error=oauth_denied");
    });

    it("redirects to /login?error=oauth_denied when code is missing", async () => {
      const { callbackHandler } = await setupProvider("github");
      const { req, res } = mockReqRes({});
      await callbackHandler(req, res);
      expect(res.redirect).toHaveBeenCalledWith("/login?error=oauth_denied");
    });

    it("exchanges code and authenticates GitHub user", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      // Token exchange response
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "gh-tok-123" }), { status: 200 }),
      );
      // User info response
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "user@github.com", login: "octocat" }), {
          status: 200,
        }),
      );

      const { callbackHandler } = await setupProvider("github");
      const { req, res } = mockReqRes({ code: "auth-code-123" });
      await callbackHandler(req, res);

      expect(req.session.user).toEqual({
        email: "user@github.com",
        provider: "github",
        groups: [],
      });
      expect(res.redirect).toHaveBeenCalledWith("/");
    });

    it("fetches GitHub emails when profile email is null", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      // Token exchange
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "gh-tok" }), { status: 200 }),
      );
      // User info (no email)
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ email: null, login: "octocat" }), { status: 200 }),
      );
      // Emails endpoint
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            { email: "private@github.com", primary: true, verified: true },
            { email: "other@github.com", primary: false, verified: true },
          ]),
          { status: 200 },
        ),
      );

      const appConfig = makeAppConfig({
        permissions: [{ users: ["private@github.com"], projects: ["1"] }],
      });
      const { callbackHandler } = await setupProvider("github", {}, appConfig);
      const { req, res } = mockReqRes({ code: "code" });
      await callbackHandler(req, res);

      expect(req.session.user.email).toBe("private@github.com");
    });

    it("exchanges code and authenticates Google user", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "google-tok" }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "user@gmail.com" }), { status: 200 }),
      );

      const appConfig = makeAppConfig({
        permissions: [{ users: ["user@gmail.com"], projects: ["1"] }],
      });
      const { callbackHandler } = await setupProvider("google", {}, appConfig);
      const { req, res } = mockReqRes({ code: "google-code" });
      await callbackHandler(req, res);

      expect(req.session.user).toEqual({
        email: "user@gmail.com",
        provider: "google",
        groups: [],
      });
    });

    it("exchanges code and authenticates GitLab user", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "gl-tok" }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "user@gitlab.com" }), { status: 200 }),
      );

      const appConfig = makeAppConfig({
        permissions: [{ users: ["user@gitlab.com"], projects: ["1"] }],
      });
      const { callbackHandler } = await setupProvider("gitlab", {}, appConfig);
      const { req, res } = mockReqRes({ code: "gl-code" });
      await callbackHandler(req, res);

      expect(req.session.user).toEqual({
        email: "user@gitlab.com",
        provider: "gitlab",
        groups: [],
      });
    });

    it("redirects to /login?error=access_denied when user has no permissions", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "nobody@github.com" }), { status: 200 }),
      );

      const { callbackHandler } = await setupProvider("github");
      const { req, res } = mockReqRes({ code: "code" });
      await callbackHandler(req, res);

      expect(res.redirect).toHaveBeenCalledWith("/login?error=access_denied");
    });

    it("redirects to /login?error=oauth_error when token exchange fails", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response("Bad Request", { status: 400 }),
      );

      const { callbackHandler } = await setupProvider("github");
      const { req, res } = mockReqRes({ code: "bad-code" });
      await callbackHandler(req, res);

      expect(res.redirect).toHaveBeenCalledWith("/login?error=oauth_error");
    });

    it("redirects to /login?error=oauth_error when token response has error field", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "bad_verification_code" }), { status: 200 }),
      );

      const { callbackHandler } = await setupProvider("github");
      const { req, res } = mockReqRes({ code: "expired-code" });
      await callbackHandler(req, res);

      expect(res.redirect).toHaveBeenCalledWith("/login?error=oauth_error");
    });

    it("redirects to /login?error=oauth_error when user info fetch fails", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));

      const { callbackHandler } = await setupProvider("github");
      const { req, res } = mockReqRes({ code: "code" });
      await callbackHandler(req, res);

      expect(res.redirect).toHaveBeenCalledWith("/login?error=oauth_error");
    });

    it("redirects to /login?error=session_error when session save fails", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "user@github.com" }), { status: 200 }),
      );

      const { callbackHandler } = await setupProvider("github");
      const { req, res } = mockReqRes({ code: "code" });
      req.session.save = vi.fn((cb: (err?: Error) => void) => cb(new Error("Redis down")));
      await callbackHandler(req, res);

      expect(res.redirect).toHaveBeenCalledWith("/login?error=session_error");
    });

    it("GitHub token exchange does not include grant_type", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "user@github.com" }), { status: 200 }),
      );

      const { callbackHandler } = await setupProvider("github");
      const { req, res } = mockReqRes({ code: "code" });
      await callbackHandler(req, res);

      const tokenCall = fetchSpy.mock.calls[0];
      const body = (tokenCall[1] as any).body as string;
      expect(body).not.toContain("grant_type");
    });

    it("Google token exchange includes grant_type=authorization_code", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "user@gmail.com" }), { status: 200 }),
      );

      const appConfig = makeAppConfig({
        permissions: [{ users: ["user@gmail.com"], projects: ["1"] }],
      });
      const { callbackHandler } = await setupProvider("google", {}, appConfig);
      const { req, res } = mockReqRes({ code: "code" });
      await callbackHandler(req, res);

      const tokenCall = fetchSpy.mock.calls[0];
      const body = (tokenCall[1] as any).body as string;
      expect(body).toContain("grant_type=authorization_code");
    });

    it("uses CORS_ORIGIN for redirect when set", async () => {
      process.env.CORS_ORIGIN = "http://localhost:5173";
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "tok" }), { status: 200 }),
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ email: "nobody@x.com" }), { status: 200 }),
      );

      const { callbackHandler } = await setupProvider("github");
      const { req, res } = mockReqRes({ code: "code" });
      await callbackHandler(req, res);

      expect(res.redirect).toHaveBeenCalledWith(
        "http://localhost:5173/login?error=access_denied",
      );
      delete process.env.CORS_ORIGIN;
    });
  });
});
