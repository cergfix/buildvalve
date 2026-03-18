import type { CIProvider, CIPipeline, CIJob } from "./types.js";
import { CIProviderError } from "./types.js";

export class GitLabProvider implements CIProvider {
  readonly type = "gitlab" as const;
  readonly name: string;
  private baseUrl: string;
  private token: string;

  constructor(name: string, baseUrl: string, token: string) {
    this.name = name;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.token = token;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v4${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        "PRIVATE-TOKEN": this.token,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new CIProviderError(res.status, text, "gitlab", path);
    }

    return res.json() as Promise<T>;
  }

  async triggerPipeline(
    projectId: string,
    ref: string,
    variables: { key: string; value: string }[]
  ): Promise<CIPipeline> {
    const raw = await this.request<GitLabRawPipeline>(
      "POST",
      `/projects/${encodeURIComponent(projectId)}/pipeline`,
      {
        ref,
        variables: variables.map((v) => ({
          key: v.key,
          value: v.value,
          variable_type: "env_var",
        })),
      }
    );
    return this.toPipeline(raw);
  }

  async listPipelines(
    projectId: string,
    options?: { per_page?: number; page?: number; ref?: string }
  ): Promise<CIPipeline[]> {
    const params = new URLSearchParams();
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));
    if (options?.ref) params.set("ref", options.ref);
    params.set("order_by", "id");
    params.set("sort", "desc");

    const query = params.toString();
    const raw = await this.request<GitLabRawPipeline[]>(
      "GET",
      `/projects/${encodeURIComponent(projectId)}/pipelines?${query}`
    );
    return raw.map((p) => this.toPipeline(p));
  }

  async getPipeline(projectId: string, pipelineId: string): Promise<CIPipeline> {
    const raw = await this.request<GitLabRawPipeline>(
      "GET",
      `/projects/${encodeURIComponent(projectId)}/pipelines/${pipelineId}`
    );
    return this.toPipeline(raw);
  }

  async getPipelineJobs(projectId: string, pipelineId: string): Promise<CIJob[]> {
    const raw = await this.request<GitLabRawJob[]>(
      "GET",
      `/projects/${encodeURIComponent(projectId)}/pipelines/${pipelineId}/jobs`
    );
    return raw.map((j) => this.toJob(j));
  }

  async getJobTrace(projectId: string, jobId: string): Promise<string> {
    const url = `${this.baseUrl}/api/v4/projects/${encodeURIComponent(projectId)}/jobs/${jobId}/trace`;
    const res = await fetch(url, {
      headers: { "PRIVATE-TOKEN": this.token },
    });

    if (!res.ok) {
      if (res.status === 404) return "Waiting for logs...";
      const text = await res.text();
      throw new CIProviderError(res.status, text, "gitlab", `/projects/${projectId}/jobs/${jobId}/trace`);
    }
    return res.text();
  }

  private toPipeline(raw: GitLabRawPipeline): CIPipeline {
    return {
      id: String(raw.id),
      provider: "gitlab",
      project_id: String(raw.project_id),
      status: raw.status,
      ref: raw.ref,
      sha: raw.sha,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      web_url: raw.web_url,
    };
  }

  private toJob(raw: GitLabRawJob): CIJob {
    return {
      id: String(raw.id),
      name: raw.name,
      stage: raw.stage,
      status: raw.status,
      created_at: raw.created_at,
      started_at: raw.started_at,
      finished_at: raw.finished_at,
      duration: raw.duration,
      web_url: raw.web_url,
    };
  }
}

interface GitLabRawPipeline {
  id: number;
  iid: number;
  project_id: number;
  status: string;
  ref: string;
  sha: string;
  created_at: string;
  updated_at: string;
  web_url: string;
  source: string;
}

interface GitLabRawJob {
  id: number;
  name: string;
  stage: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration: number | null;
  web_url: string;
}
