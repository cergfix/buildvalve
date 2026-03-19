import type { AppConfig, AuthUser, ProjectConfig, PipelineConfig } from "../types/index.js";

export function getAllowedProjectIds(user: AuthUser, config: AppConfig): Set<string> {
  const allowed = new Set<string>();

  for (const rule of config.permissions) {
    let matches = false;

    if (rule.users?.includes(user.email)) {
      matches = true;
    }

    if (!matches && rule.groups && user.groups) {
      for (const group of rule.groups) {
        if (user.groups.includes(group)) {
          matches = true;
          break;
        }
      }
    }

    if (matches) {
      for (const projectId of rule.projects) {
        allowed.add(projectId);
      }
    }
  }

  return allowed;
}

export function getAllowedProjects(user: AuthUser, config: AppConfig): ProjectConfig[] {
  const allowedIds = getAllowedProjectIds(user, config);
  return config.projects.filter((p) => allowedIds.has(p.id));
}

export function isAuthorized(user: AuthUser, projectId: string, config: AppConfig): boolean {
  return getAllowedProjectIds(user, config).has(projectId);
}

/**
 * Check if user can access a specific pipeline within a project they already have access to.
 * If the pipeline has no allowed_users/allowed_groups, anyone with project access can use it.
 * If restrictions are set, the user must match at least one.
 */
export function isPipelineAuthorized(user: AuthUser, pipeline: PipelineConfig): boolean {
  const hasUserRestriction = pipeline.allowed_users && pipeline.allowed_users.length > 0;
  const hasGroupRestriction = pipeline.allowed_groups && pipeline.allowed_groups.length > 0;

  // No restrictions = everyone with project access can use this pipeline
  if (!hasUserRestriction && !hasGroupRestriction) return true;

  if (hasUserRestriction && pipeline.allowed_users!.includes(user.email)) return true;

  if (hasGroupRestriction && user.groups) {
    for (const group of pipeline.allowed_groups!) {
      if (user.groups.includes(group)) return true;
    }
  }

  return false;
}
