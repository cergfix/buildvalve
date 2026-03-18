/** Shared API response types for CI/CD pipeline data. */

export type CIProviderType = "gitlab" | "github-actions" | "circleci";

export interface RecentProjectPipelines {
  projectId: string;
  pipelines: RecentPipeline[];
}

export interface RecentPipeline {
  id: string;
  status: string;
  ref: string;
  web_url: string;
  provider?: CIProviderType;
}

export interface TriggerResponse {
  id: string;
}

export interface CIJobDetail {
  id: string;
  name: string;
  stage: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration: number | null;
  web_url: string;
}

export interface PipelineRunDetail {
  pipeline: {
    id: string;
    status: string;
    ref: string;
    web_url: string;
    created_at: string;
    updated_at: string;
    provider?: CIProviderType;
  };
  jobs: CIJobDetail[];
}

export interface PipelineHistoryEntry {
  id: string;
  status: string;
  ref: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  duration: number | null;
  provider?: CIProviderType;
}

/** Error shape returned by fetchApi */
export interface ApiError {
  status?: number;
  message?: string;
}
