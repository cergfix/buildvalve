import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppConfig } from "../types/index.js";

vi.mock("../middleware/requireAuth.js", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../utils/access.js", () => ({
  access: vi.fn(),
}));

vi.mock("../services/ci/index.js", () => ({
  getCIProvider: vi.fn(),
}));

import { createPipelineRouter, _resetRecentPipelinesCacheForTests } from "./pipelines.js";
import { getCIProvider } from "../services/ci/index.js";
import { CIProviderError, type CIPipeline } from "../services/ci/types.js";
import { MockCIProvider } from "../services/ci/mock-provider.js";

function makeConfig(): AppConfig {
  return {
    ci_providers: [{ name: "default", type: "gitlab", url: "https://gitlab.example.com", token: "tok" }],
    auth: { providers: [] },
    session: { secret: "testsecret", max_age: 3600 },
    projects: [
      {
        id: "1", name: "P1", provider: "default", external_id: "1",
        pipelines: [
          { name: "deploy-all", ref: "main", variables: [] },  // no restrictions
          { name: "deploy-prod", ref: "main", variables: [], allowed_users: ["alice@co.com"] },
          { name: "deploy-staging", ref: "main", variables: [], allowed_groups: ["devops"] },
        ],
      },
    ],
    permissions: [{ users: ["alice@co.com", "bob@co.com"], projects: ["1"] }],
  };
}

function findHandler(router: any, method: string, path: string) {
  const layer = (router as any).stack.find((l: any) => l.route?.path === path);
  if (!layer) throw new Error(`Route ${path} not found`);
  const methodStack = layer.route.stack.filter(
    (s: any) => s.method === method || !s.method,
  );
  return methodStack[methodStack.length - 1].handle;
}

function mockReqRes(
  sessionUser: { email: string; provider: string; groups?: string[] },
  body?: any,
  params?: any,
  query?: any,
) {
  const req = {
    session: { user: sessionUser },
    body: body ?? {},
    params: params ?? {},
    query: query ?? {},
    on: vi.fn(),
  } as any;
  const res = {
    json: vi.fn().mockReturnThis(),
    status: vi.fn().mockReturnThis(),
    type: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    writeHead: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  } as any;
  return { req, res };
}

let config: AppConfig;
let router: any;
let mockProvider: MockCIProvider;

beforeEach(() => {
  vi.clearAllMocks();
  _resetRecentPipelinesCacheForTests();
  config = makeConfig();
  mockProvider = new MockCIProvider("default", "gitlab");
  vi.mocked(getCIProvider).mockReturnValue(mockProvider);
  router = createPipelineRouter(config);
});

// ── Per-pipeline permissions ────────────────────────────────────────────────

describe("GET /api/pipelines - per-pipeline filtering", () => {
  it("returns all pipelines for a user with no restrictions (deploy-all visible to all project members)", () => {
    const handler = findHandler(router, "get", "/api/pipelines");
    const { req, res } = mockReqRes({ email: "bob@co.com", provider: "mock" });

    handler(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const projects = res.json.mock.calls[0][0];
    expect(projects).toHaveLength(1);
    // bob has no group and is not in allowed_users for deploy-prod or deploy-staging
    const pipelineNames = projects[0].pipelines.map((p: any) => p.name);
    expect(pipelineNames).toContain("deploy-all");
    expect(pipelineNames).not.toContain("deploy-prod");
    expect(pipelineNames).not.toContain("deploy-staging");
  });

  it("returns pipelines restricted by allowed_users when user matches", () => {
    const handler = findHandler(router, "get", "/api/pipelines");
    const { req, res } = mockReqRes({ email: "alice@co.com", provider: "mock" });

    handler(req, res);

    const projects = res.json.mock.calls[0][0];
    const pipelineNames = projects[0].pipelines.map((p: any) => p.name);
    expect(pipelineNames).toContain("deploy-all");
    expect(pipelineNames).toContain("deploy-prod");
    // alice is not in the devops group
    expect(pipelineNames).not.toContain("deploy-staging");
  });

  it("returns pipelines restricted by allowed_groups when user is in a matching group", () => {
    const handler = findHandler(router, "get", "/api/pipelines");
    const { req, res } = mockReqRes({ email: "bob@co.com", provider: "mock", groups: ["devops"] });

    handler(req, res);

    const projects = res.json.mock.calls[0][0];
    const pipelineNames = projects[0].pipelines.map((p: any) => p.name);
    expect(pipelineNames).toContain("deploy-all");
    expect(pipelineNames).toContain("deploy-staging");
    // bob is not in allowed_users for deploy-prod
    expect(pipelineNames).not.toContain("deploy-prod");
  });

  it("filters out entire project when user has no project permission", () => {
    const handler = findHandler(router, "get", "/api/pipelines");
    const { req, res } = mockReqRes({ email: "stranger@co.com", provider: "mock" });

    handler(req, res);

    const projects = res.json.mock.calls[0][0];
    expect(projects).toHaveLength(0);
  });

  it("pipelines with no allowed_users/allowed_groups are visible to all project members", () => {
    const handler = findHandler(router, "get", "/api/pipelines");

    // Both alice and bob are project members
    for (const email of ["alice@co.com", "bob@co.com"]) {
      const { req, res } = mockReqRes({ email, provider: "mock" });
      handler(req, res);
      const projects = res.json.mock.calls[0][0];
      const pipelineNames = projects[0].pipelines.map((p: any) => p.name);
      expect(pipelineNames).toContain("deploy-all");
      vi.clearAllMocks();
    }
  });
});

describe("POST /api/pipelines/trigger - per-pipeline permissions", () => {
  it("returns 403 when user is not authorized for a specific pipeline", async () => {
    const handler = findHandler(router, "post", "/api/pipelines/trigger");
    const { req, res } = mockReqRes(
      { email: "bob@co.com", provider: "mock" },
      { projectId: "1", pipelineName: "deploy-prod" },
    );

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authorized for this pipeline" });
  });

  it("allows trigger when user is in allowed_users", async () => {
    const handler = findHandler(router, "post", "/api/pipelines/trigger");
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      { projectId: "1", pipelineName: "deploy-prod" },
    );

    await handler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledTimes(1);
    // Should have returned the triggered pipeline object
    const result = res.json.mock.calls[0][0];
    expect(result).toHaveProperty("id");
    expect(result).toHaveProperty("status");
  });

  it("allows trigger when user is in allowed_groups", async () => {
    const handler = findHandler(router, "post", "/api/pipelines/trigger");
    const { req, res } = mockReqRes(
      { email: "bob@co.com", provider: "mock", groups: ["devops"] },
      { projectId: "1", pipelineName: "deploy-staging" },
    );

    await handler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledTimes(1);
    const result = res.json.mock.calls[0][0];
    expect(result).toHaveProperty("id");
  });

  it("allows trigger for unrestricted pipeline by any project member", async () => {
    const handler = findHandler(router, "post", "/api/pipelines/trigger");
    const { req, res } = mockReqRes(
      { email: "bob@co.com", provider: "mock" },
      { projectId: "1", pipelineName: "deploy-all" },
    );

    await handler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledTimes(1);
    const result = res.json.mock.calls[0][0];
    expect(result).toHaveProperty("id");
  });

  it("returns 403 when user has no project access at all", async () => {
    const handler = findHandler(router, "post", "/api/pipelines/trigger");
    const { req, res } = mockReqRes(
      { email: "stranger@co.com", provider: "mock" },
      { projectId: "1", pipelineName: "deploy-all" },
    );

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authorized for this project" });
  });
});

describe("POST /api/pipelines/:projectId/:pipelineId/cancel - cancel run", () => {
  it("calls provider.cancelPipeline and responds canceled:true for authorized user", async () => {
    const handler = findHandler(router, "post", "/api/pipelines/:projectId/:pipelineId/cancel");
    const cancelSpy = vi.spyOn(mockProvider, "cancelPipeline").mockResolvedValue(undefined);
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      undefined,
      { projectId: "1", pipelineId: "pipe-123" },
    );

    await handler(req, res);

    expect(cancelSpy).toHaveBeenCalledWith("1", "pipe-123");
    expect(res.json).toHaveBeenCalledWith({ canceled: true });
  });

  it("returns 403 when user is not authorized for the project", async () => {
    const handler = findHandler(router, "post", "/api/pipelines/:projectId/:pipelineId/cancel");
    const cancelSpy = vi.spyOn(mockProvider, "cancelPipeline").mockResolvedValue(undefined);
    const { req, res } = mockReqRes(
      { email: "stranger@co.com", provider: "mock" },
      undefined,
      { projectId: "1", pipelineId: "pipe-123" },
    );

    await handler(req, res);

    expect(cancelSpy).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authorized for this project" });
  });

  it("surfaces provider errors as appropriate status codes", async () => {
    const { CIProviderError } = await import("../services/ci/types.js");
    const handler = findHandler(router, "post", "/api/pipelines/:projectId/:pipelineId/cancel");
    vi.spyOn(mockProvider, "cancelPipeline").mockRejectedValue(
      new CIProviderError(404, "pipeline not found", "mock", "/cancel"),
    );
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      undefined,
      { projectId: "1", pipelineId: "pipe-missing" },
    );

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    const payload = res.json.mock.calls[0][0];
    expect(payload.error).toBe("CI provider error");
  });
});

// ── SSE endpoints ───────────────────────────────────────────────────────────

// ── /api/pipelines/recent ──────────────────────────────────────────────────

describe("GET /api/pipelines/recent - dashboard heartbeat / sidebar count", () => {
  function makePipeline(id: string, createdAt: string): CIPipeline {
    return {
      id, provider: "gitlab", project_id: "1", status: "success", ref: "main",
      sha: "abc", created_at: createdAt, updated_at: createdAt,
      web_url: `http://mock-gitlab.local/1/-/pipelines/${id}`,
    };
  }

  it("returns one entry per allowed project with the listPipelines payload", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/recent");
    const { req, res } = mockReqRes({ email: "alice@co.com", provider: "mock" });

    vi.spyOn(mockProvider, "listPipelines").mockResolvedValue([
      makePipeline("100", "2025-01-01T10:00:00Z"),
      makePipeline("101", "2025-01-01T11:00:00Z"),
    ]);

    await handler(req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    const body = res.json.mock.calls[0][0];
    expect(body).toHaveLength(1);
    expect(body[0].projectId).toBe("1");
    expect(body[0].projectName).toBe("P1");
    expect(body[0].pipelines).toHaveLength(2);
  });

  it("sorts pipelines by created_at descending (newest first)", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/recent");
    const { req, res } = mockReqRes({ email: "alice@co.com", provider: "mock" });

    vi.spyOn(mockProvider, "listPipelines").mockResolvedValue([
      makePipeline("old", "2025-01-01T08:00:00Z"),
      makePipeline("new", "2025-01-01T12:00:00Z"),
      makePipeline("mid", "2025-01-01T10:00:00Z"),
    ]);

    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body[0].pipelines.map((p: any) => p.id)).toEqual(["new", "mid", "old"]);
  });

  it("filters out projects the user has no permission for", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/recent");
    const { req, res } = mockReqRes({ email: "stranger@co.com", provider: "mock" });

    vi.spyOn(mockProvider, "listPipelines").mockResolvedValue([makePipeline("100", "2025-01-01T10:00:00Z")]);

    await handler(req, res);

    expect(res.json).toHaveBeenCalledWith([]);
  });

  it("returns 502 when the CI provider errors", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/recent");
    const { req, res } = mockReqRes({ email: "alice@co.com", provider: "mock" });

    vi.spyOn(mockProvider, "listPipelines").mockRejectedValue(
      new CIProviderError(500, "boom", "default", "/listPipelines")
    );

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "CI provider error" })
    );
  });

  // When a triggered-runs store is wired in, /recent should mirror /history's
  // semantics and only surface runs BuildValve itself launched. Anything that
  // appears in the upstream provider's listing but isn't in our store is
  // hidden — keeps the two pages consistent.
  it("filters out non-BV-triggered runs when a triggered_runs store is wired", async () => {
    const ours = new Map<string, any>([
      [
        "100",
        {
          projectId: "1", pipelineName: "Deploy", ref: "main", runId: "100",
          triggeredAt: Date.now(), triggeredByEmail: "alice@co.com",
          variables: { ENV: "prod" },
        },
      ],
    ]);
    const fakeStore = {
      record: vi.fn(),
      listRecent: vi.fn(),
      listRecentByProject: vi.fn().mockResolvedValue(ours),
      prune: vi.fn(),
      close: vi.fn(),
    };

    _resetRecentPipelinesCacheForTests();
    const routerWithStore = createPipelineRouter(config, fakeStore as any);
    const handler = findHandler(routerWithStore, "get", "/api/pipelines/recent");
    const { req, res } = mockReqRes({ email: "alice@co.com", provider: "mock" });

    vi.spyOn(mockProvider, "listPipelines").mockResolvedValue([
      makePipeline("100", "2025-01-01T10:00:00Z"), // BV-triggered
      makePipeline("999", "2025-01-01T11:00:00Z"), // upstream-triggered, must be filtered out
    ]);

    await handler(req, res);

    const body = res.json.mock.calls[0][0];
    expect(body[0].pipelines.map((p: any) => p.id)).toEqual(["100"]);
    expect(body[0].pipelines[0].triggered_by).toBe("alice@co.com");
    expect(body[0].pipelines[0].triggered_variables).toEqual({ ENV: "prod" });
    expect(fakeStore.listRecentByProject).toHaveBeenCalledWith("1", 100);
  });

  it("falls back to the unfiltered list when the triggered_runs store throws", async () => {
    const fakeStore = {
      record: vi.fn(),
      listRecent: vi.fn(),
      listRecentByProject: vi.fn().mockRejectedValue(new Error("db down")),
      prune: vi.fn(),
      close: vi.fn(),
    };

    _resetRecentPipelinesCacheForTests();
    const routerWithStore = createPipelineRouter(config, fakeStore as any);
    const handler = findHandler(routerWithStore, "get", "/api/pipelines/recent");
    const { req, res } = mockReqRes({ email: "alice@co.com", provider: "mock" });

    vi.spyOn(mockProvider, "listPipelines").mockResolvedValue([
      makePipeline("100", "2025-01-01T10:00:00Z"),
      makePipeline("999", "2025-01-01T11:00:00Z"),
    ]);

    await handler(req, res);

    // No silent blanking — the user still sees what the upstream returned.
    const body = res.json.mock.calls[0][0];
    expect(body[0].pipelines.map((p: any) => p.id).sort()).toEqual(["100", "999"]);
  });
});

// ── /api/pipelines/:projectId/history ──────────────────────────────────────

describe("GET /api/pipelines/:projectId/history - filtered run history", () => {
  it("returns history for an authorized user", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/history");
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      undefined,
      { projectId: "1" },
      { ref: "main" }
    );

    vi.spyOn(mockProvider, "listPipelines").mockResolvedValue([
      {
        id: "1", provider: "gitlab", project_id: "1", status: "success", ref: "main", sha: "a",
        created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:01:00Z",
        web_url: "http://mock-gitlab.local/1/-/pipelines/1",
      } satisfies CIPipeline,
    ]);

    await handler(req, res);

    expect(mockProvider.listPipelines).toHaveBeenCalledWith("1", { per_page: 50, ref: "main" });
    expect(res.json).toHaveBeenCalledTimes(1);
    expect((res.json.mock.calls[0][0] as CIPipeline[])[0].id).toBe("1");
  });

  it("returns 403 for unauthorized user", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/history");
    const { req, res } = mockReqRes(
      { email: "stranger@co.com", provider: "mock" },
      undefined,
      { projectId: "1" },
      { ref: "main" }
    );

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authorized for this project" });
  });

  it("returns 404 when the project doesn't exist", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/history");
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      undefined,
      { projectId: "nope" },
      { ref: "main" }
    );

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    // isAuthorized returns false for an unknown project (no permission entry matches)
    expect(res.json).toHaveBeenCalledWith({ error: "Not authorized for this project" });
  });

  it("propagates 4xx CI provider errors verbatim", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/history");
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      undefined,
      { projectId: "1" },
      { ref: "main" }
    );

    vi.spyOn(mockProvider, "listPipelines").mockRejectedValue(
      new CIProviderError(404, "not found", "default", "/listPipelines")
    );

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "CI provider error" })
    );
  });

  it("maps 5xx CI provider errors to 502", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/history");
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      undefined,
      { projectId: "1" },
      { ref: "main" }
    );

    vi.spyOn(mockProvider, "listPipelines").mockRejectedValue(
      new CIProviderError(500, "boom", "default", "/listPipelines")
    );

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
  });
});

describe("GET /api/pipelines/:projectId/:pipelineId/stream - SSE pipeline stream", () => {
  it("returns correct SSE headers for authorized user", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/:pipelineId/stream");
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      undefined,
      { projectId: "1", pipelineId: "999" },
    );

    // Mock getPipeline to return a terminal pipeline so polling stops
    vi.spyOn(mockProvider, "getPipeline").mockResolvedValue({
      id: "999",
      provider: "gitlab",
      project_id: "1",
      status: "success",
      ref: "main",
      sha: "abc123",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      web_url: "http://mock-gitlab.local/1/-/pipelines/999",
    });
    vi.spyOn(mockProvider, "getPipelineJobs").mockResolvedValue([]);

    await handler(req, res);

    // Allow async poll tick
    await new Promise((r) => setTimeout(r, 50));

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  it("returns 403 for unauthorized user", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/:pipelineId/stream");
    const { req, res } = mockReqRes(
      { email: "stranger@co.com", provider: "mock" },
      undefined,
      { projectId: "1", pipelineId: "999" },
    );

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authorized for this project" });
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it("writes SSE status event and done event for terminal pipeline", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/:pipelineId/stream");
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      undefined,
      { projectId: "1", pipelineId: "999" },
    );

    vi.spyOn(mockProvider, "getPipeline").mockResolvedValue({
      id: "999",
      provider: "gitlab",
      project_id: "1",
      status: "success",
      ref: "main",
      sha: "abc123",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      web_url: "http://mock-gitlab.local/1/-/pipelines/999",
    });
    vi.spyOn(mockProvider, "getPipelineJobs").mockResolvedValue([]);

    await handler(req, res);
    await new Promise((r) => setTimeout(r, 50));

    // Should have written a status event
    const writeCallArgs = res.write.mock.calls.map((c: any) => c[0]);
    expect(writeCallArgs.some((arg: string) => arg.startsWith("event: status\n"))).toBe(true);
    // Should have written a done event for terminal status
    expect(writeCallArgs.some((arg: string) => arg.startsWith("event: done\n"))).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });
});

describe("GET /api/pipelines/:projectId/jobs/:jobId/trace/stream - SSE job trace stream", () => {
  it("returns correct SSE headers for authorized user", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/jobs/:jobId/trace/stream");
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      undefined,
      { projectId: "1", jobId: "500" },
      { pipelineId: "999" },
    );

    vi.spyOn(mockProvider, "getJobTrace").mockResolvedValue("some log output");
    vi.spyOn(mockProvider, "getPipelineJobs").mockResolvedValue([
      {
        id: "500",
        name: "build",
        stage: "build",
        status: "success",
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        duration: 10,
        web_url: "http://mock-gitlab.local/1/-/jobs/500",
      },
    ]);

    await handler(req, res);
    await new Promise((r) => setTimeout(r, 50));

    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  it("returns 403 for unauthorized user", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/jobs/:jobId/trace/stream");
    const { req, res } = mockReqRes(
      { email: "stranger@co.com", provider: "mock" },
      undefined,
      { projectId: "1", jobId: "500" },
    );

    await handler(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Not authorized for this project" });
    expect(res.writeHead).not.toHaveBeenCalled();
  });

  it("writes SSE logs event and done event for finished job", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/jobs/:jobId/trace/stream");
    const { req, res } = mockReqRes(
      { email: "bob@co.com", provider: "mock" },
      undefined,
      { projectId: "1", jobId: "500" },
      { pipelineId: "999" },
    );

    vi.spyOn(mockProvider, "getJobTrace").mockResolvedValue("Job completed successfully.\n");
    vi.spyOn(mockProvider, "getPipelineJobs").mockResolvedValue([
      {
        id: "500",
        name: "build",
        stage: "build",
        status: "success",
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        duration: 10,
        web_url: "http://mock-gitlab.local/1/-/jobs/500",
      },
    ]);

    await handler(req, res);
    await new Promise((r) => setTimeout(r, 50));

    const writeCallArgs = res.write.mock.calls.map((c: any) => c[0]);
    expect(writeCallArgs.some((arg: string) => arg.startsWith("event: logs\n"))).toBe(true);
    expect(writeCallArgs.some((arg: string) => arg.startsWith("event: done\n"))).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });

  // Regression: when CircleCI returns a freshly-queued job whose executor
  // hasn't started yet, the v1.1 trace endpoint returns no steps and the
  // job status is "pending" (or, before the normalizer fix, something like
  // "blocked" / "not_running"). The stream must NOT close — otherwise the
  // user opens logs right after launching and sees "stream closed" with
  // no output (see the v0.4.x bug report).
  it("keeps the stream open while job is pending and trace is empty", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/jobs/:jobId/trace/stream");
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      undefined,
      { projectId: "1", jobId: "500" },
      { pipelineId: "999" },
    );

    vi.spyOn(mockProvider, "getJobTrace").mockResolvedValue("");
    vi.spyOn(mockProvider, "getPipelineJobs").mockResolvedValue([
      {
        id: "500",
        name: "build",
        stage: "build",
        status: "pending",
        created_at: new Date().toISOString(),
        started_at: null,
        finished_at: null,
        duration: null,
        web_url: "http://mock-gitlab.local/1/-/jobs/500",
      },
    ]);

    await handler(req, res);
    await new Promise((r) => setTimeout(r, 50));

    const writeCallArgs = res.write.mock.calls.map((c: any) => c[0]);
    // No logs event (trace was empty), no done event (status non-terminal),
    // and the response was not ended.
    expect(writeCallArgs.some((arg: string) => arg.startsWith("event: logs\n"))).toBe(false);
    expect(writeCallArgs.some((arg: string) => arg.startsWith("event: done\n"))).toBe(false);
    expect(res.end).not.toHaveBeenCalled();
  });

  // Regression: any non-terminal status (including unrecognized future values)
  // must keep the stream open. Before the fix, "anything not in
  // [running,pending,created]" closed the stream — so a fresh CircleCI status
  // like "blocked" closed the SSE immediately.
  it("keeps the stream open for an unrecognized non-terminal status", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/jobs/:jobId/trace/stream");
    const { req, res } = mockReqRes(
      { email: "alice@co.com", provider: "mock" },
      undefined,
      { projectId: "1", jobId: "500" },
      { pipelineId: "999" },
    );

    vi.spyOn(mockProvider, "getJobTrace").mockResolvedValue("");
    vi.spyOn(mockProvider, "getPipelineJobs").mockResolvedValue([
      {
        id: "500",
        name: "build",
        stage: "build",
        status: "spinning_up_executor", // arbitrary non-terminal string
        created_at: new Date().toISOString(),
        started_at: null,
        finished_at: null,
        duration: null,
        web_url: "http://mock-gitlab.local/1/-/jobs/500",
      },
    ]);

    await handler(req, res);
    await new Promise((r) => setTimeout(r, 50));

    expect(res.end).not.toHaveBeenCalled();
  });

  it("closes the stream when job reaches a terminal 'failed' state", async () => {
    const handler = findHandler(router, "get", "/api/pipelines/:projectId/jobs/:jobId/trace/stream");
    const { req, res } = mockReqRes(
      { email: "bob@co.com", provider: "mock" },
      undefined,
      { projectId: "1", jobId: "500" },
      { pipelineId: "999" },
    );

    vi.spyOn(mockProvider, "getJobTrace").mockResolvedValue("compile failed\n");
    vi.spyOn(mockProvider, "getPipelineJobs").mockResolvedValue([
      {
        id: "500",
        name: "build",
        stage: "build",
        status: "failed",
        created_at: new Date().toISOString(),
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        duration: 8,
        web_url: "http://mock-gitlab.local/1/-/jobs/500",
      },
    ]);

    await handler(req, res);
    await new Promise((r) => setTimeout(r, 50));

    const writeCallArgs = res.write.mock.calls.map((c: any) => c[0]);
    expect(writeCallArgs.some((arg: string) => arg.startsWith("event: done\n"))).toBe(true);
    expect(res.end).toHaveBeenCalled();
  });
});
