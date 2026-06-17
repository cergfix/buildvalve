import type { CIProvider, CIPipeline, CIJob } from "./types.js";
import { CIProviderError } from "./types.js";

/**
 * Strip ANSI escape sequences (SGR color codes, cursor moves, OSC, etc.) from
 * log text. CircleCI's web UI interprets these and renders colors; BuildValve's
 * terminal prints text verbatim, so without stripping, tools like fastlane that
 * emit heavily-colored output show up as garbage ("←[32m★ …"). Pattern is the
 * canonical ansi-regex matcher (CSI + OSC forms).
 */
const ANSI_RE = new RegExp(
  "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d/#&.:=?%@~_]*)*)?\\u0007)|(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-ntqry=><~]))",
  "g",
);

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, "");
}

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

  async cancelPipeline(_projectId: string, pipelineId: string): Promise<void> {
    // CircleCI v2 cancels at the workflow level (not the pipeline). A
    // pipeline can host multiple workflows — cancel all that aren't already
    // terminal. The endpoint returns 202 on success.
    const workflows = await this.request<{ items: CircleCIWorkflow[] }>(
      "GET",
      `/pipeline/${pipelineId}/workflow`,
    );
    const TERMINAL = new Set(["success", "failed", "canceled", "error", "timedout"]);
    const url = (wfId: string) => `${this.apiUrl}/api/v2/workflow/${wfId}/cancel`;
    await Promise.all(
      workflows.items
        .filter((wf) => !TERMINAL.has(wf.status))
        .map(async (wf) => {
          const res = await fetch(url(wf.id), {
            method: "POST",
            headers: { "Circle-Token": this.token, "Content-Type": "application/json" },
          });
          // CircleCI returns 200/202 on success. Some races return 4xx with
          // "workflow is not running" — those are effectively no-ops, so we
          // swallow them for idempotency.
          if (!res.ok && res.status !== 400 && res.status !== 409) {
            const text = await res.text();
            throw new CIProviderError(res.status, text, "circleci", `/workflow/${wf.id}/cancel`);
          }
        }),
    );
  }

  async getJobTrace(projectId: string, jobId: string): Promise<string> {
    // The v2 job-detail endpoint doesn't include step output — only v1.1 does.
    // v1.1 is deprecated but still serves logs. projectId is the v2 slug
    // ("gh/Org/Repo" or "circleci/Org/Repo") which v1.1 also accepts.
    // jobId is the integer build number (see toJob: id = String(job_number)).
    const url = `${this.apiUrl}/api/v1.1/project/${projectId}/${jobId}`;
    try {
      const res = await fetch(url, {
        headers: { "Circle-Token": this.token, Accept: "application/json" },
      });
      if (!res.ok) {
        return `Could not fetch logs (HTTP ${res.status}). View logs at the CircleCI web UI.`;
      }

      const detail = (await res.json()) as CircleCIJobDetail;
      if (!detail.steps || detail.steps.length === 0) {
        // No steps yet: most commonly a freshly-queued job whose executor is
        // still spinning up. Return empty so the SSE poll keeps the stream
        // open and writes real log content once steps appear, instead of
        // sending a misleading "no output" placeholder.
        return "";
      }

      let output = "";
      for (const step of detail.steps) {
        output += `=== ${step.name} ===\n`;
        for (const action of step.actions) {
          if (action.output_url) {
            try {
              const r = await fetch(action.output_url);
              if (r.ok) {
                const body = await r.text();
                // CircleCI gzip-encodes step output and the S3 signed URL omits
                // the Content-Encoding header — fetch decodes most cases, but
                // some clients see a `[{message: "..."}]` JSON array, others a
                // raw string. Handle both.
                try {
                  const entries = JSON.parse(body) as { message: string }[];
                  for (const entry of entries) output += entry.message;
                } catch {
                  output += body;
                }
              } else {
                output += `[step output unavailable: HTTP ${r.status}]\n`;
              }
            } catch (e) {
              output += `[step output fetch failed: ${(e as Error).message}]\n`;
            }
          }
        }
        output += "\n";
      }

      return stripAnsi(output) || "No log output available.";
    } catch (e) {
      return `Could not fetch logs from CircleCI (${(e as Error).message}). View logs at the CircleCI web UI.`;
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
      case "terminated-unknown":
      case "unauthorized":
        return "failed";
      case "not_run":
      case "on_hold":
      case "queued":
      case "not_running": // waiting for an executor to spin up
      case "blocked":     // waiting on approval / dependency
        return "pending";
      case "retried":
        // The original job was retried — work has moved to a new job.
        // Treat as canceled so it doesn't keep the log stream open.
        return "canceled";
      case "canceled":
        return "canceled";
      default:
        // Unknown statuses are treated as pending rather than passed through:
        // an unknown status closing a log stream prematurely is a real bug
        // we hit (see SSE terminal-state check in pipelines.ts).
        return "pending";
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
