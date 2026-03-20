import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CircleCIProvider } from "./circleci-provider.js";
import { CIProviderError } from "./types.js";

describe("CircleCIProvider", () => {
  let provider: CircleCIProvider;
  let fetchSpy: any;

  beforeEach(() => {
    provider = new CircleCIProvider("cci-main", "cc-test-token");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("has correct type and name", () => {
    expect(provider.type).toBe("circleci");
    expect(provider.name).toBe("cci-main");
  });

  describe("triggerPipeline", () => {
    it("sends POST with branch and parameters", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "pipeline-uuid-123",
            number: 42,
            state: "pending",
            created_at: "2025-01-01T00:00:00Z",
          }),
          { status: 200 }
        )
      );

      const result = await provider.triggerPipeline(
        "gh/myorg/api",
        "main",
        [{ key: "DEPLOY_ENV", value: "staging" }]
      );

      expect(result.id).toBe("pipeline-uuid-123");
      expect(result.provider).toBe("circleci");
      expect(result.ref).toBe("main");

      const call = fetchSpy.mock.calls[0];
      expect(call[0]).toContain("/api/v2/project/gh/myorg/api/pipeline");
      const body = JSON.parse((call[1] as any).body);
      expect(body.branch).toBe("main");
      expect(body.parameters).toEqual({ DEPLOY_ENV: "staging" });

      // Verify auth header
      expect((call[1] as any).headers["Circle-Token"]).toBe("cc-test-token");
    });

    it("throws CIProviderError on API failure", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("Forbidden", { status: 403 }));

      await expect(
        provider.triggerPipeline("gh/org/repo", "main", [])
      ).rejects.toThrow(CIProviderError);
    });
  });

  describe("listPipelines", () => {
    it("fetches pipelines and resolves status from workflows", async () => {
      // List pipelines response
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "uuid-1",
                number: 10,
                state: "created",
                created_at: "2025-01-01T00:00:00Z",
                updated_at: "2025-01-01T01:00:00Z",
                vcs: { branch: "main", revision: "abc123" },
              },
            ],
            next_page_token: null,
          }),
          { status: 200 }
        )
      );
      // Workflow status for uuid-1
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              { id: "wf-1", name: "build-and-deploy", status: "success", created_at: "2025-01-01T00:00:00Z", stopped_at: null },
            ],
          }),
          { status: 200 }
        )
      );

      const result = await provider.listPipelines("gh/org/repo", { per_page: 10 });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("uuid-1");
      expect(result[0].status).toBe("success");
      expect(result[0].ref).toBe("main");
      expect(result[0].sha).toBe("abc123");
      expect(result[0].web_url).toContain("circleci.com");
    });

    it("passes branch filter as query param", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], next_page_token: null }), { status: 200 })
      );

      await provider.listPipelines("gh/org/repo", { ref: "develop" });
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("branch=develop");
    });
  });

  describe("getPipeline", () => {
    it("fetches pipeline and resolves workflow status", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "uuid-1",
            number: 10,
            state: "created",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T01:00:00Z",
            vcs: { branch: "main", revision: "abc" },
          }),
          { status: 200 }
        )
      );
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ id: "wf-1", name: "build", status: "running", created_at: "2025-01-01T00:00:00Z", stopped_at: null }],
          }),
          { status: 200 }
        )
      );

      const result = await provider.getPipeline("gh/org/repo", "uuid-1");
      expect(result.status).toBe("running");
    });
  });

  describe("getPipelineJobs", () => {
    it("fetches workflows then jobs and normalizes", async () => {
      // Workflows response
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ id: "wf-1", name: "build-and-deploy", status: "success", created_at: "2025-01-01T00:00:00Z", stopped_at: null }],
          }),
          { status: 200 }
        )
      );
      // Jobs for workflow response
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [
              {
                id: "job-uuid-1",
                job_number: 100,
                name: "build",
                type: "build",
                status: "success",
                started_at: "2025-01-01T00:00:00Z",
                stopped_at: "2025-01-01T00:02:00Z",
              },
              {
                id: "job-uuid-2",
                job_number: 101,
                name: "deploy",
                status: "running",
                started_at: "2025-01-01T00:02:00Z",
                stopped_at: null,
              },
            ],
          }),
          { status: 200 }
        )
      );

      const result = await provider.getPipelineJobs("gh/org/repo", "uuid-1");
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("100");
      expect(result[0].name).toBe("build");
      expect(result[0].status).toBe("success");
      expect(result[0].duration).toBe(120);
      expect(result[1].id).toBe("101");
      expect(result[1].status).toBe("running");
      expect(result[1].duration).toBeNull();
    });

    it("returns empty array when no workflows exist", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [] }), { status: 200 })
      );

      const result = await provider.getPipelineJobs("gh/org/repo", "uuid-1");
      expect(result).toEqual([]);
    });
  });

  describe("getJobTrace", () => {
    it("returns log output from step actions", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            steps: [
              {
                name: "Checkout",
                actions: [
                  { output_url: "https://circle-output.s3.amazonaws.com/log1", status: "success" },
                ],
              },
            ],
          }),
          { status: 200 }
        )
      );
      // Fetch the output_url
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify([{ message: "Cloning repo...\n" }, { message: "Done\n" }]), { status: 200 })
      );

      const result = await provider.getJobTrace("gh/org/repo", "100");
      expect(result).toContain("Checkout");
      expect(result).toContain("Cloning repo...");
    });

    it("returns fallback message when no steps available", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ steps: [] }), { status: 200 })
      );

      const result = await provider.getJobTrace("gh/org/repo", "100");
      expect(result).toContain("No log output available");
    });

    it("returns fallback message on API error", async () => {
      fetchSpy.mockResolvedValueOnce(new Response("Not Found", { status: 404 }));

      const result = await provider.getJobTrace("gh/org/repo", "100");
      expect(result).toContain("not available");
    });
  });

  describe("status normalization", () => {
    it("normalizes CircleCI-specific statuses", async () => {
      const statuses = [
        { input: "success", expected: "success" },
        { input: "fixed", expected: "success" },
        { input: "failed", expected: "failed" },
        { input: "error", expected: "failed" },
        { input: "infrastructure_fail", expected: "failed" },
        { input: "timedout", expected: "failed" },
        { input: "running", expected: "running" },
        { input: "not_run", expected: "pending" },
        { input: "on_hold", expected: "pending" },
        { input: "queued", expected: "pending" },
        { input: "canceled", expected: "canceled" },
      ];

      for (const { input, expected } of statuses) {
        // Pipeline fetch
        fetchSpy.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: "p-1",
                  number: 1,
                  state: "created",
                  created_at: "2025-01-01T00:00:00Z",
                  vcs: { branch: "main", revision: "abc" },
                },
              ],
              next_page_token: null,
            }),
            { status: 200 }
          )
        );
        // Workflow status fetch
        fetchSpy.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              items: [{ id: "wf-1", name: "build", status: input, created_at: "2025-01-01T00:00:00Z", stopped_at: null }],
            }),
            { status: 200 }
          )
        );

        const result = await provider.listPipelines("gh/org/repo", { per_page: 1 });
        expect(result[0].status).toBe(expected);
      }
    });
  });

  describe("custom API URL", () => {
    it("uses custom API URL when provided", async () => {
      const custom = new CircleCIProvider("custom", "tok", "https://circleci.corp.com");
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify({ items: [], next_page_token: null }), { status: 200 })
      );

      await custom.listPipelines("proj");
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("circleci.corp.com/api/v2");
    });
  });
});
