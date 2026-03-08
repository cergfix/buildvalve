import type { GitLabPipeline, GitLabJob } from "../types/index.js";

export class GitLabService {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v4${path}`;
    const headers: Record<string, string> = {
      "PRIVATE-TOKEN": this.token,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new GitLabApiError(res.status, text, path);
    }

    return res.json() as Promise<T>;
  }

  async triggerPipeline(
    projectId: number,
    ref: string,
    variables: { key: string; value: string }[]
  ): Promise<GitLabPipeline> {
    return this.request<GitLabPipeline>("POST", `/projects/${projectId}/pipeline`, {
      ref,
      variables: variables.map((v) => ({
        key: v.key,
        value: v.value,
        variable_type: "env_var",
      })),
    });
  }

  async listPipelines(
    projectId: number,
    options?: { per_page?: number; page?: number; ref?: string }
  ): Promise<GitLabPipeline[]> {
    const params = new URLSearchParams();
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));
    if (options?.ref) params.set("ref", options.ref);
    params.set("order_by", "id");
    params.set("sort", "desc");

    const query = params.toString();
    return this.request<GitLabPipeline[]>("GET", `/projects/${projectId}/pipelines?${query}`);
  }

  async getPipeline(projectId: number, pipelineId: number): Promise<GitLabPipeline> {
    return this.request<GitLabPipeline>(
      "GET",
      `/projects/${projectId}/pipelines/${pipelineId}`
    );
  }

  async getPipelineJobs(projectId: number, pipelineId: number): Promise<GitLabJob[]> {
    return this.request<GitLabJob[]>(
      "GET",
      `/projects/${projectId}/pipelines/${pipelineId}/jobs`
    );
  }

  async getJobTrace(projectId: number, jobId: number): Promise<string> {
    const url = `${this.baseUrl}/api/v4/projects/${projectId}/jobs/${jobId}/trace`;
    const res = await fetch(url, {
      headers: { "PRIVATE-TOKEN": this.token },
    });
    
    if (!res.ok) {
      if (res.status === 404) return "Waiting for logs...";
      const text = await res.text();
      throw new GitLabApiError(res.status, text, `/projects/${projectId}/jobs/${jobId}/trace`);
    }
    return res.text();
  }
}

export class GitLabApiError extends Error {
  status: number;
  path: string;

  constructor(status: number, body: string, path: string) {
    super(`GitLab API error ${status} on ${path}: ${body}`);
    this.name = "GitLabApiError";
    this.status = status;
    this.path = path;
  }
}
