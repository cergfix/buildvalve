import { describe, it, expect, vi, beforeEach } from "vitest";
import { GitLabService, GitLabApiError } from "./gitlab.js";

describe("GitLabApiError", () => {
  it("formats error message with status, path, and body", () => {
    const err = new GitLabApiError(404, "Not Found", "/projects/1");
    expect(err.message).toBe("GitLab API error 404 on /projects/1: Not Found");
    expect(err.status).toBe(404);
    expect(err.path).toBe("/projects/1");
    expect(err.name).toBe("GitLabApiError");
  });
});

describe("GitLabService", () => {
  let service: GitLabService;

  beforeEach(() => {
    service = new GitLabService("https://gitlab.example.com/", "test-token");
    vi.restoreAllMocks();
  });

  it("strips trailing slash from baseUrl", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await service.listPipelines(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(/^https:\/\/gitlab\.example\.com\/api\/v4/),
      expect.any(Object)
    );
  });

  it("sends PRIVATE-TOKEN header", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await service.listPipelines(1);
    const callHeaders = spy.mock.calls[0][1]?.headers as Record<string, string>;
    expect(callHeaders["PRIVATE-TOKEN"]).toBe("test-token");
  });

  it("throws GitLabApiError on non-ok response", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Forbidden", { status: 403 })
    );
    await expect(service.listPipelines(1)).rejects.toThrow(GitLabApiError);
  });

  it("triggerPipeline sends POST with variables", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: 42 }), { status: 200 })
    );
    await service.triggerPipeline(5, "main", [{ key: "ENV", value: "prod" }]);

    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("/projects/5/pipeline"),
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
    expect(body.ref).toBe("main");
    expect(body.variables).toEqual([
      { key: "ENV", value: "prod", variable_type: "env_var" },
    ]);
  });

  it("listPipelines builds query params", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await service.listPipelines(1, { per_page: 20, ref: "develop" });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("per_page=20");
    expect(url).toContain("ref=develop");
    expect(url).toContain("order_by=id");
    expect(url).toContain("sort=desc");
  });

  it("getJobTrace returns text on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("log line 1\nlog line 2", { status: 200 })
    );
    const trace = await service.getJobTrace(1, 99);
    expect(trace).toBe("log line 1\nlog line 2");
  });

  it("getJobTrace returns placeholder on 404", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Not Found", { status: 404 })
    );
    const trace = await service.getJobTrace(1, 99);
    expect(trace).toBe("Waiting for logs...");
  });
});
