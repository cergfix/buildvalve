/** Shared API response types for GitLab pipeline data. */

export interface RecentProjectPipelines {
  projectId: number;
  pipelines: RecentPipeline[];
}

export interface RecentPipeline {
  id: number;
  status: string;
  ref: string;
  web_url: string;
}

export interface TriggerResponse {
  id: number;
}

export interface GitLabJobDetail {
  id: number;
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
    id: number;
    status: string;
    ref: string;
    web_url: string;
    created_at: string;
    updated_at: string;
  };
  jobs: GitLabJobDetail[];
}

export interface PipelineHistoryEntry {
  id: number;
  status: string;
  ref: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  duration: number | null;
}

/** Error shape returned by fetchApi */
export interface ApiError {
  status?: number;
  message?: string;
}
