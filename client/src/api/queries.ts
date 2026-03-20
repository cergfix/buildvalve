import { fetchApi } from "./client";
import type { AuthUser, ProjectConfig, AppConfig } from "../../../server/src/types";
import type { RecentProjectPipelines, TriggerResponse, PipelineRunDetail, PipelineHistoryEntry } from "./types";

export type { RecentProjectPipelines, TriggerResponse, PipelineRunDetail, PipelineHistoryEntry };

export interface PipelinesData {
  user: AuthUser;
  projects: ProjectConfig[];
  isAdmin: boolean;
  externalLinks?: { label: string; url: string }[];
}

export interface ProviderInfo {
  type: string;
  label: string;
  buttonLabel: string;
  loginUrl: string;
  form?: "credentials";
}

export const authApi = {
  getProviders: () => fetchApi<ProviderInfo[]>("/api/auth/providers"),
  getMe: () => fetchApi<PipelinesData>("/api/auth/me"),
  logout: () => fetchApi<{ ok: boolean }>("/api/auth/logout", { method: "POST" }),
};

export const pipelinesApi = {
  getRecent: () => fetchApi<RecentProjectPipelines[]>("/api/pipelines/recent"),
  trigger: (projectId: string, pipelineName: string, variables: Record<string, string>) =>
    fetchApi<TriggerResponse>("/api/pipelines/trigger", {
      method: "POST",
      body: JSON.stringify({ projectId, pipelineName, variables }),
    }),
  getPipeline: (projectId: string, pipelineId: string) =>
    fetchApi<PipelineRunDetail>(`/api/pipelines/${encodeURIComponent(projectId)}/${encodeURIComponent(pipelineId)}`),
  getHistory: (projectId: string, ref: string) =>
    fetchApi<PipelineHistoryEntry[]>(`/api/pipelines/${encodeURIComponent(projectId)}/history?ref=${encodeURIComponent(ref)}`),
};

export const adminApi = {
  getConfig: () => fetchApi<AppConfig>("/api/admin/config"),
};
