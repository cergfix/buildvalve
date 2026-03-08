/** Provider-agnostic CI/CD pipeline types. */

export type CIProviderType = "gitlab" | "github-actions" | "circleci";

export interface CIPipeline {
  id: string;
  provider: CIProviderType;
  project_id: string;
  status: string; // normalized: "running" | "success" | "failed" | "pending" | "canceled"
  ref: string;
  sha: string;
  created_at: string;
  updated_at: string;
  web_url: string;
}

export interface CIJob {
  id: string;
  name: string;
  stage: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration: number | null;
  web_url: string;
}

export interface CIProvider {
  readonly type: CIProviderType;
  readonly name: string;

  triggerPipeline(
    projectId: string,
    ref: string,
    variables: { key: string; value: string }[],
    workflowId?: string
  ): Promise<CIPipeline>;

  listPipelines(
    projectId: string,
    options?: { per_page?: number; page?: number; ref?: string }
  ): Promise<CIPipeline[]>;

  getPipeline(projectId: string, pipelineId: string): Promise<CIPipeline>;

  getPipelineJobs(projectId: string, pipelineId: string): Promise<CIJob[]>;

  getJobTrace(projectId: string, jobId: string): Promise<string>;

  /**
   * Cancel an in-flight pipeline / workflow run. Implementations should be
   * idempotent — calling on an already-terminal run should resolve without
   * throwing. Errors during the upstream API call should throw
   * CIProviderError so the route can return a meaningful status.
   */
  cancelPipeline(projectId: string, pipelineId: string): Promise<void>;
}

export class CIProviderError extends Error {
  status: number;
  provider: string;
  path: string;

  constructor(status: number, body: string, provider: string, path: string) {
    super(`${provider} API error ${status} on ${path}: ${body}`);
    this.name = "CIProviderError";
    this.status = status;
    this.provider = provider;
    this.path = path;
  }
}
