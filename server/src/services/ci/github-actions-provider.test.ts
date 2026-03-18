import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitHubActionsProvider } from "./github-actions-provider.js";
import { CIProviderError } from "./types.js";

describe("GitHubActionsProvider", () => {
  let provider: GitHubActionsProvider;
  let fetchSpy: any;

  beforeEach(() => {
    provider = new GitHubActionsProvider("github-oss", "ghp-test-token");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("has correct type and name", () => {
    expect(provider.type).toBe("github-actions");
    expect(provider.name).toBe("github-oss");
  });

  describe("triggerPipeline", () => {
    it("dispatches workflow and polls for run", async () => {
      // Dispatch returns 204
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
      // Poll returns the new run
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 999,
                status: "queued",
                conclusion: null,
                head_branch: "main",
                head_sha: "abc123",
                created_at: "2025-01-01T00:00:00Z",
                updated_at: "2025-01-01T00:00:01Z",
                html_url: "https://github.com/owner/repo/actions/runs/999",
              },
            ],
          }),
          { status: 200 }
        )
      );

      const result = await provider.triggerPipeline(
        "owner/repo",
        "main",
        [{ key: "ENV", value: "prod" }],
        "deploy.yml"
      );

      expect(result.id).toBe("999");
      expect(result.provider).toBe("github-actions");
      expect(result.status).toBe("pending");
      expect(result.ref).toBe("main");

      // Verify dispatch call
      const dispatchCall = fetchSpy.mock.calls[0];
      expect(dispatchCall[0]).toContain("/repos/owner/repo/actions/workflows/deploy.yml/dispatches");
      const body = JSON.parse((dispatchCall[1] as any).body);
      expect(body.ref).toBe("main");
      expect(body.inputs).toEqual({ ENV: "prod" });

      // Verify auth header
      expect((dispatchCall[1] as any).headers.Authorization).toBe("Bearer ghp-test-token");
    });

    it("throws when workflow_id is not provided", async () => {
      await expect(
        provider.triggerPipeline("owner/repo", "main", [])
      ).rejects.toThrow("workflow_id is required");
    });

    it("returns synthetic placeholder when poll finds no run", async () => {
      fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }));
      // All poll attempts return empty
      for (let i = 0; i < 5; i++) {
        fetchSpy.mockResolvedValueOnce(
          new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 })
        );
      }

      const result = await provider.triggerPipeline("owner/repo", "main", [], "ci.yml");
      expect(result.id).toBe("0");
      expect(result.status).toBe("pending");
    }, 15000);
  });

  describe("listPipelines", () => {
    it("fetches workflow runs and normalizes statuses", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 1,
                status: "completed",
                conclusion: "success",
                head_branch: "main",
                head_sha: "abc",
                created_at: "2025-01-01T00:00:00Z",
                updated_at: "2025-01-01T01:00:00Z",
                html_url: "https://github.com/o/r/actions/runs/1",
              },
              {
                id: 2,
                status: "in_progress",
                conclusion: null,
                head_branch: "main",
                head_sha: "def",
                created_at: "2025-01-02T00:00:00Z",
                updated_at: "2025-01-02T00:30:00Z",
                html_url: "https://github.com/o/r/actions/runs/2",
              },
              {
                id: 3,
                status: "completed",
                conclusion: "failure",
                head_branch: "dev",
                head_sha: "ghi",
                created_at: "2025-01-03T00:00:00Z",
                updated_at: "2025-01-03T00:10:00Z",
                html_url: "https://github.com/o/r/actions/runs/3",
              },
              {
                id: 4,
                status: "completed",
                conclusion: "cancelled",
                head_branch: "main",
                head_sha: "jkl",
                created_at: "2025-01-04T00:00:00Z",
                updated_at: "2025-01-04T00:05:00Z",
                html_url: "https://github.com/o/r/actions/runs/4",
              },
            ],
          }),
          { status: 200 }
        )
      );

      const result = await provider.listPipelines("o/r", { per_page: 10, ref: "main" });

      expect(result).toHaveLength(4);
      expect(result[0].status).toBe("success");
      expect(result[1].status).toBe("running");
      expect(result[2].status).toBe("failed");
      expect(result[3].status).toBe("canceled");
    });

    it("passes branch filter as query param", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 })
      );

      await provider.listPipelines("o/r", { ref: "develop" });
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("branch=develop");
    });
  });

  describe("getPipeline", () => {
    it("fetches a single run", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 42,
            status: "completed",
            conclusion: "success",
            head_branch: "main",
            head_sha: "abc",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T01:00:00Z",
            html_url: "https://github.com/o/r/actions/runs/42",
          }),
          { status: 200 }
        )
      );

      const result = await provider.getPipeline("o/r", "42");
      expect(result.id).toBe("42");
      expect(result.status).toBe("success");
    });
  });

  describe("getPipelineJobs", () => {
    it("fetches and normalizes jobs", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            jobs: [
              {
                id: 100,
                name: "build",
                status: "completed",
                conclusion: "success",
                started_at: "2025-01-01T00:00:00Z",
                completed_at: "2025-01-01T00:05:00Z",
                html_url: "https://github.com/o/r/actions/runs/42/jobs/100",
              },
              {
                id: 101,
                name: "deploy",
                status: "in_progress",
                conclusion: null,
                started_at: "2025-01-01T00:05:00Z",
                completed_at: null,
                html_url: "https://github.com/o/r/actions/runs/42/jobs/101",
              },
            ],
          }),
          { status: 200 }
        )
      );

      const result = await provider.getPipelineJobs("o/r", "42");
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("build");
      expect(result[0].status).toBe("success");
      expect(result[0].duration).toBe(300); // 5 minutes
      expect(result[0].stage).toBe("run");
      expect(result[1].name).toBe("deploy");
      expect(result[1].status).toBe("running");
      expect(result[1].duration).toBeNull();
    });
  });

  describe("getJobTrace", () => {
    it("returns log text on success", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response("Build output line 1\nBuild output line 2\n", { status: 200 })
      );

      const trace = await provider.getJobTrace("o/r", "100");
      expect(trace).toContain("Build output line 1");
    });

    it("returns waiting message on 404", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

      const trace = await provider.getJobTrace("o/r", "100");
      expect(trace).toBe("Waiting for logs...");
    });

    it("throws CIProviderError on other errors", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
      await expect(provider.getJobTrace("o/r", "100")).rejects.toThrow(CIProviderError);
    });
  });

  describe("custom API URL", () => {
    it("uses custom API URL when provided", async () => {
      const ghes = new GitHubActionsProvider("ghes", "tok", "https://github.corp.com/api/v3");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 })
      );

      await ghes.listPipelines("o/r");
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("github.corp.com/api/v3");
    });
  });

  describe("status normalization", () => {
    it("normalizes queued status to pending", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            workflow_runs: [
              {
                id: 1,
                status: "queued",
                conclusion: null,
                head_branch: "main",
                head_sha: "abc",
                created_at: "2025-01-01T00:00:00Z",
                updated_at: "2025-01-01T00:00:00Z",
                html_url: "https://github.com/o/r/actions/runs/1",
              },
            ],
          }),
          { status: 200 }
        )
      );

      const result = await provider.listPipelines("o/r");
      expect(result[0].status).toBe("pending");
    });
  });
});
