import type { AppConfig, AuthUser, ProjectConfig } from "../types/index.js";

export function getAllowedProjectIds(user: AuthUser, config: AppConfig): Set<number> {
  const allowed = new Set<number>();

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

export function isAuthorized(user: AuthUser, projectId: number, config: AppConfig): boolean {
  return getAllowedProjectIds(user, config).has(projectId);
}
