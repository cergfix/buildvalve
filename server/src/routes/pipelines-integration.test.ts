import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppConfig } from "../types/index.js";

vi.mock("../middleware/requireAuth.js", () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../utils/audit.js", () => ({
  audit: vi.fn(),
}));

vi.mock("../services/ci/index.js", () => ({
  getCIProvider: vi.fn(),
}));

import { createPipelineRouter } from "./pipelines.js";
import { getCIProvider } from "../services/ci/index.js";
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

// ── SSE endpoints ───────────────────────────────────────────────────────────

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
});
