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

/** Pipeline config as returned by the API, with resolved provider fields. */
export interface ResolvedPipeline {
  name: string;
  ref: string;
  workflow_id?: string;
  variables: { key: string; value: string; locked: boolean; required?: boolean; description?: string; type?: string; options?: string[] }[];
  provider?: string;
  external_id?: string;
  allowed_users?: string[];
  allowed_groups?: string[];
  resolvedProvider: string;
  resolvedExternalId: string;
  providerType?: CIProviderType;
}

/** Error shape returned by fetchApi */
export interface ApiError {
  status?: number;
  message?: string;
}
