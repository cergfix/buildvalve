import { describe, it, expect, vi, beforeEach } from "vitest";
import { MockCIProvider } from "./mock-provider.js";

vi.mock("../../utils/logger.js", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

describe("MockCIProvider", () => {
  describe("constructor", () => {
    it("sets type and name from arguments", () => {
      const p = new MockCIProvider("my-gitlab", "gitlab");
      expect(p.type).toBe("gitlab");
      expect(p.name).toBe("my-gitlab");
    });

    it("supports all provider types", () => {
      expect(new MockCIProvider("a", "gitlab").type).toBe("gitlab");
      expect(new MockCIProvider("b", "github-actions").type).toBe("github-actions");
      expect(new MockCIProvider("c", "circleci").type).toBe("circleci");
    });
  });

  describe("triggerPipeline", () => {
    it("returns a running pipeline with correct fields", async () => {
      const p = new MockCIProvider("test", "gitlab");
      const result = await p.triggerPipeline("42", "main", [{ key: "ENV", value: "prod" }]);

      expect(result.provider).toBe("gitlab");
      expect(result.project_id).toBe("42");
      expect(result.status).toBe("running");
      expect(result.ref).toBe("main");
      expect(result.id).toBeDefined();
      expect(result.web_url).toContain("42");
      expect(result.created_at).toBeDefined();
    });

    it("returns unique IDs for successive triggers", async () => {
      const p = new MockCIProvider("test", "github-actions");
      const r1 = await p.triggerPipeline("repo", "main", []);
      const r2 = await p.triggerPipeline("repo", "main", []);

      expect(r1.id).not.toBe(r2.id);
    });

    it("sets provider-specific web URLs", async () => {
      const gl = new MockCIProvider("gl", "gitlab");
      const gh = new MockCIProvider("gh", "github-actions");
      const cc = new MockCIProvider("cc", "circleci");

      const glResult = await gl.triggerPipeline("42", "main", []);
      const ghResult = await gh.triggerPipeline("owner/repo", "main", []);
      const ccResult = await cc.triggerPipeline("gh/org/api", "main", []);

      expect(glResult.web_url).toContain("mock-gitlab.local");
      expect(ghResult.web_url).toContain("github.com");
      expect(ccResult.web_url).toContain("circleci.com");
    });
  });

  describe("listPipelines", () => {
    it("returns empty array for project with no pipelines", async () => {
      const p = new MockCIProvider("test", "gitlab");
      const result = await p.listPipelines("unknown-project");
      expect(result).toEqual([]);
    });

    it("returns triggered pipelines for matching project and provider", async () => {
      const p = new MockCIProvider("test", "gitlab");
      await p.triggerPipeline("42", "main", []);

      const result = await p.listPipelines("42");
      expect(result.length).toBeGreaterThanOrEqual(1);
      expect(result[0].project_id).toBe("42");
    });

    it("does not return pipelines from a different provider type", async () => {
      const gl = new MockCIProvider("gl-test", "gitlab");
      const gh = new MockCIProvider("gh-test", "github-actions");

      await gl.triggerPipeline("42", "main", []);
      const ghResult = await gh.listPipelines("42");
      // gh should not see gl's pipelines (different provider type)
      expect(ghResult.every((p) => p.provider === "github-actions")).toBe(true);
    });
  });

  describe("getPipeline", () => {
    it("returns a specific pipeline by ID", async () => {
      const p = new MockCIProvider("test", "circleci");
      const triggered = await p.triggerPipeline("proj", "main", []);

      const result = await p.getPipeline("proj", triggered.id);
      expect(result.id).toBe(triggered.id);
      expect(result.status).toBe("running");
    });

    it("throws for non-existent pipeline", async () => {
      const p = new MockCIProvider("test", "gitlab");
      await expect(p.getPipeline("42", "99999")).rejects.toThrow("Mock pipeline not found");
    });
  });

  describe("getPipelineJobs", () => {
    it("returns jobs for a triggered pipeline", async () => {
      const p = new MockCIProvider("test", "gitlab");
      const triggered = await p.triggerPipeline("42", "main", []);

      const jobs = await p.getPipelineJobs("42", triggered.id);
      expect(jobs.length).toBe(2);
      expect(jobs[0].name).toBe("build");
      expect(jobs[0].status).toBe("success");
      expect(jobs[1].name).toBe("deploy");
      expect(jobs[1].status).toBe("running");
    });

    it("returns empty array for non-existent pipeline", async () => {
      const p = new MockCIProvider("test", "gitlab");
      const jobs = await p.getPipelineJobs("42", "99999");
      expect(jobs).toEqual([]);
    });
  });

  describe("getJobTrace", () => {
    it("returns mock log output", async () => {
      const p = new MockCIProvider("test", "gitlab");
      const triggered = await p.triggerPipeline("42", "main", []);
      const jobs = await p.getPipelineJobs("42", triggered.id);

      const runningJob = jobs.find((j) => j.status === "running")!;
      const trace = await p.getJobTrace("42", runningJob.id);
      expect(trace).toContain("mock");
      expect(trace).toContain("still running");
    });

    it("shows completed message for finished job", async () => {
      const p = new MockCIProvider("test", "github-actions");
      const triggered = await p.triggerPipeline("repo", "main", []);
      const jobs = await p.getPipelineJobs("repo", triggered.id);

      const successJob = jobs.find((j) => j.status === "success")!;
      const trace = await p.getJobTrace("repo", successJob.id);
      expect(trace).toContain("completed successfully");
    });

    it("includes provider type in log output", async () => {
      const p = new MockCIProvider("test", "circleci");
      const trace = await p.getJobTrace("proj", "any-id");
      expect(trace).toContain("circleci");
    });
  });
});
