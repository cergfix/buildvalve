import { fetchApi } from "./client";
import type { AuthUser, ProjectConfig, AppConfig, VariableConfig } from "../../../server/src/types";
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
  cancel: (projectId: string, pipelineId: string) =>
    fetchApi<{ canceled: true }>(
      `/api/pipelines/${encodeURIComponent(projectId)}/${encodeURIComponent(pipelineId)}/cancel`,
      { method: "POST" },
    ),
};

export const adminApi = {
  getConfig: () => fetchApi<AppConfig>("/api/admin/config"),
};

/**
 * Build the variables payload for a one-click relaunch from a prior run's
 * recorded variables. Locked variables are dropped (the server re-injects them
 * from config, and submitting them risks an "is locked" rejection if config
 * changed); only non-locked keys that still exist in the pipeline config are
 * resubmitted. Returns {} when the prior variables are unknown, which the
 * server treats as a defaults launch.
 */
export function relaunchVariables(
  variables: VariableConfig[] | undefined,
  triggered: Record<string, string> | undefined
): Record<string, string> {
  if (!triggered || !variables) return {};
  const out: Record<string, string> = {};
  for (const vc of variables) {
    if (!vc.locked && vc.key in triggered) out[vc.key] = triggered[vc.key];
  }
  return out;
}
