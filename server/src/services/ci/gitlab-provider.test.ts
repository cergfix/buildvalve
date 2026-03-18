import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GitLabProvider } from "./gitlab-provider.js";
import { CIProviderError } from "./types.js";

describe("GitLabProvider", () => {
  let provider: GitLabProvider;
  let fetchSpy: any;

  beforeEach(() => {
    provider = new GitLabProvider("gitlab-corp", "https://gitlab.example.com", "glpat-test");
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("has correct type and name", () => {
    expect(provider.type).toBe("gitlab");
    expect(provider.name).toBe("gitlab-corp");
  });

  describe("triggerPipeline", () => {
    it("sends POST to GitLab API and normalizes response", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 123,
            iid: 45,
            project_id: 42,
            status: "pending",
            ref: "main",
            sha: "abc123",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:01Z",
            web_url: "https://gitlab.example.com/p/-/pipelines/123",
            source: "api",
          }),
          { status: 200 }
        )
      );

      const result = await provider.triggerPipeline("42", "main", [
        { key: "ENV", value: "prod" },
      ]);

      expect(result.id).toBe("123");
      expect(result.provider).toBe("gitlab");
      expect(result.project_id).toBe("42");
      expect(result.status).toBe("pending");
      expect(result.ref).toBe("main");

      const call = fetchSpy.mock.calls[0];
      expect(call[0]).toBe("https://gitlab.example.com/api/v4/projects/42/pipeline");
      const body = JSON.parse((call[1] as any).body);
      expect(body.variables).toEqual([
        { key: "ENV", value: "prod", variable_type: "env_var" },
      ]);
    });

    it("throws CIProviderError on API failure", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response("Forbidden", { status: 403 })
      );

      await expect(
        provider.triggerPipeline("42", "main", [])
      ).rejects.toThrow(CIProviderError);
    });
  });

  describe("listPipelines", () => {
    it("sends GET with query params and normalizes response", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 100,
              iid: 10,
              project_id: 42,
              status: "success",
              ref: "main",
              sha: "def456",
              created_at: "2025-01-01T00:00:00Z",
              updated_at: "2025-01-01T01:00:00Z",
              web_url: "https://gitlab.example.com/p/-/pipelines/100",
              source: "push",
            },
          ]),
          { status: 200 }
        )
      );

      const result = await provider.listPipelines("42", { per_page: 5, ref: "main" });

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("100");
      expect(result[0].provider).toBe("gitlab");

      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("per_page=5");
      expect(url).toContain("ref=main");
      expect(url).toContain("order_by=id");
    });
  });

  describe("getPipeline", () => {
    it("fetches a single pipeline and normalizes", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 100,
            iid: 10,
            project_id: 42,
            status: "running",
            ref: "main",
            sha: "abc",
            created_at: "2025-01-01T00:00:00Z",
            updated_at: "2025-01-01T00:00:00Z",
            web_url: "https://gitlab.example.com/p/-/pipelines/100",
            source: "api",
          }),
          { status: 200 }
        )
      );

      const result = await provider.getPipeline("42", "100");
      expect(result.id).toBe("100");
      expect(result.status).toBe("running");
    });
  });

  describe("getPipelineJobs", () => {
    it("fetches and normalizes jobs", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 500,
              name: "build",
              stage: "build",
              status: "success",
              created_at: "2025-01-01T00:00:00Z",
              started_at: "2025-01-01T00:00:01Z",
              finished_at: "2025-01-01T00:00:30Z",
              duration: 29,
              web_url: "https://gitlab.example.com/p/-/jobs/500",
            },
          ]),
          { status: 200 }
        )
      );

      const result = await provider.getPipelineJobs("42", "100");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("500");
      expect(result[0].name).toBe("build");
      expect(result[0].duration).toBe(29);
    });
  });

  describe("getJobTrace", () => {
    it("returns log text", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response("Line 1\nLine 2\nDone.", { status: 200 })
      );

      const trace = await provider.getJobTrace("42", "500");
      expect(trace).toBe("Line 1\nLine 2\nDone.");
    });

    it("returns waiting message on 404", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response("Not Found", { status: 404 })
      );

      const trace = await provider.getJobTrace("42", "500");
      expect(trace).toBe("Waiting for logs...");
    });

    it("throws CIProviderError on other errors", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response("Server Error", { status: 500 })
      );

      await expect(provider.getJobTrace("42", "500")).rejects.toThrow(CIProviderError);
    });
  });

  describe("URL encoding", () => {
    it("encodes project IDs with special characters", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(JSON.stringify([]), { status: 200 })
      );

      await provider.listPipelines("my/project");
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain("my%2Fproject");
    });
  });

  describe("trailing slash handling", () => {
    it("strips trailing slash from base URL", () => {
      const p = new GitLabProvider("test", "https://gitlab.com/", "tok");
      // Trigger a request to verify URL construction
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));
      p.listPipelines("1");
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).not.toContain("//api");
    });
  });
});
