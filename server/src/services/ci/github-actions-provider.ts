import type { CIProvider, CIPipeline, CIJob } from "./types.js";
import { CIProviderError } from "./types.js";

export class GitHubActionsProvider implements CIProvider {
  readonly type = "github-actions" as const;
  readonly name: string;
  private token: string;
  private apiUrl: string;

  constructor(name: string, token: string, apiUrl?: string) {
    this.name = name;
    this.token = token;
    this.apiUrl = (apiUrl ?? "https://api.github.com").replace(/\/$/, "");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (body) headers["Content-Type"] = "application/json";

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new CIProviderError(res.status, text, "github-actions", path);
    }

    // Some endpoints return 204 No Content
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  }

  async triggerPipeline(
    projectId: string,
    ref: string,
    variables: { key: string; value: string }[],
    workflowId?: string
  ): Promise<CIPipeline> {
    if (!workflowId) {
      throw new CIProviderError(400, "workflow_id is required for GitHub Actions", "github-actions", "trigger");
    }

    const inputs: Record<string, string> = {};
    for (const v of variables) {
      inputs[v.key] = v.value;
    }

    // Dispatch returns 204 with no body
    await this.request<void>(
      "POST",
      `/repos/${projectId}/actions/workflows/${encodeURIComponent(workflowId)}/dispatches`,
      { ref, inputs }
    );

    // Poll to find the newly created run (GitHub doesn't return the run ID on dispatch)
    const run = await this.pollForNewRun(projectId, ref);
    return this.toPipeline(run, projectId);
  }

  private async pollForNewRun(projectId: string, ref: string, maxAttempts = 5): Promise<GHWorkflowRun> {
    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1500));

      const result = await this.request<{ workflow_runs: GHWorkflowRun[] }>(
        "GET",
        `/repos/${projectId}/actions/runs?branch=${encodeURIComponent(ref)}&event=workflow_dispatch&per_page=1`
      );

      if (result.workflow_runs.length > 0) {
        return result.workflow_runs[0];
      }
    }

    // Return a synthetic placeholder if we can't find the run
    return {
      id: 0,
      status: "queued",
      conclusion: null,
      head_branch: ref,
      head_sha: "",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      html_url: `https://github.com/${projectId}/actions`,
    };
  }

  async listPipelines(
    projectId: string,
    options?: { per_page?: number; page?: number; ref?: string }
  ): Promise<CIPipeline[]> {
    const params = new URLSearchParams();
    if (options?.per_page) params.set("per_page", String(options.per_page));
    if (options?.page) params.set("page", String(options.page));
    if (options?.ref) params.set("branch", options.ref);

    const result = await this.request<{ workflow_runs: GHWorkflowRun[] }>(
      "GET",
      `/repos/${projectId}/actions/runs?${params.toString()}`
    );

    return result.workflow_runs.map((r) => this.toPipeline(r, projectId));
  }

  async getPipeline(projectId: string, pipelineId: string): Promise<CIPipeline> {
    const run = await this.request<GHWorkflowRun>(
      "GET",
      `/repos/${projectId}/actions/runs/${pipelineId}`
    );
    return this.toPipeline(run, projectId);
  }

  async getPipelineJobs(projectId: string, pipelineId: string): Promise<CIJob[]> {
    const result = await this.request<{ jobs: GHJob[] }>(
      "GET",
      `/repos/${projectId}/actions/runs/${pipelineId}/jobs`
    );
    return result.jobs.map((j) => this.toJob(j));
  }

  async getJobTrace(projectId: string, jobId: string): Promise<string> {
    const url = `${this.apiUrl}/repos/${projectId}/actions/jobs/${jobId}/logs`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      redirect: "follow",
    });

    if (!res.ok) {
      if (res.status === 404) return "Waiting for logs...";
      const text = await res.text();
      throw new CIProviderError(res.status, text, "github-actions", `/repos/${projectId}/actions/jobs/${jobId}/logs`);
    }
    return res.text();
  }

  private normalizeStatus(run: GHWorkflowRun): string {
    if (run.status === "completed") {
      switch (run.conclusion) {
        case "success": return "success";
        case "failure": return "failed";
        case "cancelled": return "canceled";
        default: return run.conclusion ?? "failed";
      }
    }
    if (run.status === "in_progress") return "running";
    if (run.status === "queued" || run.status === "waiting" || run.status === "requested" || run.status === "pending") return "pending";
    return run.status;
  }

  private normalizeJobStatus(job: GHJob): string {
    if (job.status === "completed") {
      switch (job.conclusion) {
        case "success": return "success";
        case "failure": return "failed";
        case "cancelled": return "canceled";
        default: return job.conclusion ?? "failed";
      }
    }
    if (job.status === "in_progress") return "running";
    return "pending";
  }

  private toPipeline(run: GHWorkflowRun, projectId: string): CIPipeline {
    return {
      id: String(run.id),
      provider: "github-actions",
      project_id: projectId,
      status: this.normalizeStatus(run),
      ref: run.head_branch,
      sha: run.head_sha,
      created_at: run.created_at,
      updated_at: run.updated_at,
      web_url: run.html_url,
    };
  }

  private toJob(job: GHJob): CIJob {
    const started = job.started_at ? new Date(job.started_at).getTime() : null;
    const finished = job.completed_at ? new Date(job.completed_at).getTime() : null;
    const duration = started && finished ? Math.round((finished - started) / 1000) : null;

    return {
      id: String(job.id),
      name: job.name,
      stage: "run", // GitHub Actions doesn't have stages
      status: this.normalizeJobStatus(job),
      created_at: job.started_at ?? new Date().toISOString(),
      started_at: job.started_at,
      finished_at: job.completed_at,
      duration,
      web_url: job.html_url,
    };
  }
}

interface GHWorkflowRun {
  id: number;
  status: string;
  conclusion: string | null;
  head_branch: string;
  head_sha: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

interface GHJob {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
}
