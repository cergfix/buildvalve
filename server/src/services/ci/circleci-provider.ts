import type { CIProvider, CIPipeline, CIJob } from "./types.js";
import { CIProviderError } from "./types.js";

export class CircleCIProvider implements CIProvider {
  readonly type = "circleci" as const;
  readonly name: string;
  private token: string;
  private apiUrl: string;

  constructor(name: string, token: string, apiUrl?: string) {
    this.name = name;
    this.token = token;
    this.apiUrl = (apiUrl ?? "https://circleci.com").replace(/\/$/, "");
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiUrl}/api/v2${path}`;
    const headers: Record<string, string> = {
      "Circle-Token": this.token,
      "Content-Type": "application/json",
    };

    const res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new CIProviderError(res.status, text, "circleci", path);
    }

    return res.json() as Promise<T>;
  }

  async triggerPipeline(
    projectId: string,
    ref: string,
    variables: { key: string; value: string }[]
  ): Promise<CIPipeline> {
    const parameters: Record<string, string> = {};
    for (const v of variables) {
      parameters[v.key] = v.value;
    }

    const raw = await this.request<CircleCIRawPipeline>(
      "POST",
      `/project/${projectId}/pipeline`,
      { branch: ref, parameters }
    );

    // CircleCI returns the pipeline immediately
    return this.toPipeline(raw, projectId, ref);
  }

  async listPipelines(
    projectId: string,
    options?: { per_page?: number; page?: number; ref?: string }
  ): Promise<CIPipeline[]> {
    const params = new URLSearchParams();
    if (options?.ref) params.set("branch", options.ref);

    // CircleCI uses page-token pagination but we simplify to per_page
    const raw = await this.request<{ items: CircleCIRawPipeline[]; next_page_token: string | null }>(
      "GET",
      `/project/${projectId}/pipeline?${params.toString()}`
    );

    // For each pipeline, fetch its workflows to get the status
    const pipelines = await Promise.all(
      raw.items.slice(0, options?.per_page ?? 20).map(async (p) => {
        const status = await this.getPipelineStatus(p.id);
        return this.toPipeline({ ...p, status }, projectId);
      })
    );

    return pipelines;
  }

  async getPipeline(projectId: string, pipelineId: string): Promise<CIPipeline> {
    const raw = await this.request<CircleCIRawPipeline>(
      "GET",
      `/pipeline/${pipelineId}`
    );
    const status = await this.getPipelineStatus(pipelineId);
    return this.toPipeline({ ...raw, status }, projectId);
  }

  async getPipelineJobs(projectId: string, pipelineId: string): Promise<CIJob[]> {
    // Get workflows for this pipeline
    const workflows = await this.request<{ items: CircleCIWorkflow[] }>(
      "GET",
      `/pipeline/${pipelineId}/workflow`
    );

    if (workflows.items.length === 0) return [];

    // Get jobs for the first (primary) workflow
    const workflowId = workflows.items[0].id;
    const jobs = await this.request<{ items: CircleCIRawJob[] }>(
      "GET",
      `/workflow/${workflowId}/job`
    );

    return jobs.items.map((j) => this.toJob(j, projectId));
  }

  async getJobTrace(projectId: string, jobId: string): Promise<string> {
    // CircleCI v2 API doesn't have a direct job log endpoint.
    // We fetch step-level actions and their output.
    try {
      // jobId in our system maps to the job number
      const steps = await this.request<CircleCIJobDetail>(
        "GET",
        `/project/${projectId}/job/${jobId}`
      );

      if (!steps.steps || steps.steps.length === 0) {
        return "No log output available. View logs at CircleCI web UI.";
      }

      let output = "";
      for (const step of steps.steps) {
        output += `=== ${step.name} ===\n`;
        for (const action of step.actions) {
          if (action.output_url) {
            try {
              const res = await fetch(action.output_url);
              if (res.ok) {
                const entries = await res.json() as { message: string }[];
                for (const entry of entries) {
                  output += entry.message;
                }
              }
            } catch {
              output += `[Could not fetch output for this step]\n`;
            }
          }
        }
        output += "\n";
      }

      return output || "No log output available.";
    } catch {
      return "Log streaming is not available for CircleCI. Check the CircleCI web UI for full logs.";
    }
  }

  private async getPipelineStatus(pipelineId: string): Promise<string> {
    try {
      const workflows = await this.request<{ items: CircleCIWorkflow[] }>(
        "GET",
        `/pipeline/${pipelineId}/workflow`
      );
      if (workflows.items.length === 0) return "pending";
      return this.normalizeStatus(workflows.items[0].status);
    } catch {
      return "unknown";
    }
  }

  private normalizeStatus(status: string): string {
    switch (status) {
      case "success":
      case "fixed":
        return "success";
      case "running":
        return "running";
      case "failed":
      case "error":
      case "infrastructure_fail":
      case "timedout":
        return "failed";
      case "not_run":
      case "on_hold":
      case "queued":
        return "pending";
      case "canceled":
        return "canceled";
      default:
        return status;
    }
  }

  private toPipeline(raw: CircleCIRawPipeline & { status?: string }, projectId: string, ref?: string): CIPipeline {
    return {
      id: raw.id,
      provider: "circleci",
      project_id: projectId,
      status: raw.status ? this.normalizeStatus(raw.status) : "pending",
      ref: ref ?? raw.vcs?.branch ?? "unknown",
      sha: raw.vcs?.revision ?? "",
      created_at: raw.created_at,
      updated_at: raw.updated_at ?? raw.created_at,
      web_url: `https://app.circleci.com/pipelines/${projectId}/${raw.number}`,
    };
  }

  private toJob(raw: CircleCIRawJob, projectId: string): CIJob {
    return {
      id: String(raw.job_number),
      name: raw.name,
      stage: raw.type ?? "run",
      status: this.normalizeStatus(raw.status),
      created_at: raw.started_at ?? new Date().toISOString(),
      started_at: raw.started_at,
      finished_at: raw.stopped_at,
      duration: raw.started_at && raw.stopped_at
        ? Math.round((new Date(raw.stopped_at).getTime() - new Date(raw.started_at).getTime()) / 1000)
        : null,
      web_url: `https://app.circleci.com/pipelines/${projectId}/jobs/${raw.job_number}`,
    };
  }
}

interface CircleCIRawPipeline {
  id: string;
  number: number;
  state: string;
  created_at: string;
  updated_at?: string;
  vcs?: {
    branch?: string;
    revision?: string;
  };
}

interface CircleCIWorkflow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  stopped_at: string | null;
}

interface CircleCIRawJob {
  id: string;
  job_number: number;
  name: string;
  type?: string;
  status: string;
  started_at: string | null;
  stopped_at: string | null;
}

interface CircleCIJobDetail {
  steps: {
    name: string;
    actions: {
      output_url?: string;
      status: string;
    }[];
  }[];
}
