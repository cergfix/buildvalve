import { describe, it, expect, vi, beforeEach } from "vitest";
import { authApi, pipelinesApi, adminApi } from "./queries";

// Mock the client module to capture calls
vi.mock("./client", () => ({
  fetchApi: vi.fn().mockResolvedValue({}),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

import { fetchApi } from "./client";

describe("authApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getProviders calls correct endpoint", async () => {
    await authApi.getProviders();
    expect(fetchApi).toHaveBeenCalledWith("/api/auth/providers");
  });

  it("getMe calls correct endpoint", async () => {
    await authApi.getMe();
    expect(fetchApi).toHaveBeenCalledWith("/api/auth/me");
  });

  it("logout sends POST", async () => {
    await authApi.logout();
    expect(fetchApi).toHaveBeenCalledWith("/api/auth/logout", { method: "POST" });
  });
});

describe("pipelinesApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getRecent calls correct endpoint", async () => {
    await pipelinesApi.getRecent();
    expect(fetchApi).toHaveBeenCalledWith("/api/pipelines/recent");
  });

  it("trigger sends POST with correct body", async () => {
    await pipelinesApi.trigger(42, "deploy", { ENV: "prod" });
    expect(fetchApi).toHaveBeenCalledWith("/api/pipelines/trigger", {
      method: "POST",
      body: JSON.stringify({ projectId: 42, pipelineName: "deploy", variables: { ENV: "prod" } }),
    });
  });

  it("getPipeline calls correct endpoint", async () => {
    await pipelinesApi.getPipeline(5, 100);
    expect(fetchApi).toHaveBeenCalledWith("/api/pipelines/5/100");
  });

  it("getHistory encodes ref parameter", async () => {
    await pipelinesApi.getHistory(5, "feature/branch");
    expect(fetchApi).toHaveBeenCalledWith(
      "/api/pipelines/5/history?ref=feature%2Fbranch"
    );
  });
});

describe("adminApi", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getConfig calls correct endpoint", async () => {
    await adminApi.getConfig();
    expect(fetchApi).toHaveBeenCalledWith("/api/admin/config");
  });
});
