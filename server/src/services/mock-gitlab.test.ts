import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MockGitLabService as MockGitLabServiceType } from "./mock-gitlab.js";

// Mock the logger to prevent file I/O during tests
vi.mock("../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("MockGitLabService", () => {
  let service: MockGitLabServiceType;

  beforeEach(async () => {
    vi.useFakeTimers();
    // Reset the module to clear the shared pipelinesDB/jobsDB Maps
    vi.resetModules();
    const mod = await import("./mock-gitlab.js");
    service = new mod.MockGitLabService();
  });

  it("creates a pipeline with running status", async () => {
    const pipeline = await service.triggerPipeline(42, "main", []);
    expect(pipeline.status).toBe("running");
    expect(pipeline.project_id).toBe(42);
    expect(pipeline.ref).toBe("main");
    expect(pipeline.source).toBe("api");
  });

  it("returns unique incrementing IDs", async () => {
    const p1 = await service.triggerPipeline(1, "main", []);
    const p2 = await service.triggerPipeline(1, "main", []);
    expect(p2.id).toBeGreaterThan(p1.id);
  });

  it("creates build and deploy jobs for each pipeline", async () => {
    const pipeline = await service.triggerPipeline(1, "main", []);
    const jobs = await service.getPipelineJobs(1, pipeline.id);
    expect(jobs).toHaveLength(2);
    expect(jobs.map((j) => j.name)).toEqual(["build", "deploy"]);
    expect(jobs[0].status).toBe("success");
    expect(jobs[1].status).toBe("running");
  });

  it("retrieves a pipeline by ID", async () => {
    const created = await service.triggerPipeline(5, "develop", []);
    const retrieved = await service.getPipeline(5, created.id);
    expect(retrieved.id).toBe(created.id);
    expect(retrieved.ref).toBe("develop");
  });

  it("throws on missing pipeline", async () => {
    await expect(service.getPipeline(1, 99999)).rejects.toThrow("Mock pipeline not found");
  });

  it("lists pipelines filtered by project", async () => {
    await service.triggerPipeline(1, "main", []);
    await service.triggerPipeline(2, "main", []);
    await service.triggerPipeline(1, "develop", []);

    const list = await service.listPipelines(1);
    expect(list).toHaveLength(2);
    expect(list.every((p) => p.project_id === 1)).toBe(true);
  });

  it("returns empty array for project with no pipelines", async () => {
    const list = await service.listPipelines(999);
    expect(list).toEqual([]);
  });

  it("getJobTrace includes project and job info", async () => {
    const pipeline = await service.triggerPipeline(10, "main", []);
    const jobs = await service.getPipelineJobs(10, pipeline.id);
    const trace = await service.getJobTrace(10, jobs[0].id);
    expect(trace).toContain("project 10");
    expect(trace).toContain(`job #${jobs[0].id}`);
  });

  it("getJobTrace indicates running state for active jobs", async () => {
    const pipeline = await service.triggerPipeline(1, "main", []);
    const jobs = await service.getPipelineJobs(1, pipeline.id);
    const deployJob = jobs.find((j) => j.name === "deploy")!;
    const trace = await service.getJobTrace(1, deployJob.id);
    expect(trace).toContain("still running");
  });

  it("pipeline transitions to success after timeout", async () => {
    const pipeline = await service.triggerPipeline(1, "main", []);
    expect(pipeline.status).toBe("running");

    vi.advanceTimersByTime(16000);

    const updated = await service.getPipeline(1, pipeline.id);
    expect(updated.status).toBe("success");
  });

  it("returns empty jobs for unknown pipeline ID", async () => {
    const jobs = await service.getPipelineJobs(1, 88888);
    expect(jobs).toEqual([]);
  });
});
