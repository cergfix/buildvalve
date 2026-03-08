import type { AppConfig, AuthUser, ProjectConfig, PipelineConfig } from "../types/index.js";

/**
 * Match an email against a config pattern. Supports three forms:
 *   • `"alice@co.com"`     — exact (case-insensitive)
 *   • `"*@example.com"`    — any user on that domain
 *   • `"*"`                — any authenticated user (catch-all)
 *
 * Other glob forms (e.g. `"alice@*.com"`, `"*-bot@*"`) are intentionally not
 * supported — keep the matcher simple so misconfigured rules can't quietly
 * grant access to the wrong people. Comparison is lowercased on both sides
 * because email domains are case-insensitive.
 */
export function emailMatchesPattern(pattern: string, email: string): boolean {
  if (pattern === "*") return true;
  const p = pattern.toLowerCase();
  const e = email.toLowerCase();
  if (p.startsWith("*@")) return e.endsWith(p.slice(1)); // e.endsWith("@domain.com")
  return p === e;
}

function anyEmailMatch(patterns: readonly string[] | undefined, email: string): boolean {
  if (!patterns) return false;
  return patterns.some((p) => emailMatchesPattern(p, email));
}

/**
 * True iff `email` is listed (or matched by a wildcard) in `config.admins`.
 * Supports the same `*`, `*@domain.com`, exact-email patterns as the
 * permissions block — so a config like `admins: ["*@your-co.com"]` works.
 */
export function isAdminEmail(email: string | undefined, config: AppConfig): boolean {
  if (!email) return false;
  return anyEmailMatch(config.admins, email);
}

/**
 * True iff any permission rule grants this user access to at least one project —
 * either by email (with `*` / `*@domain.com` wildcard support) or by group.
 * Used at login time to reject users who would land in an empty app.
 */
export function hasLoginAccess(user: AuthUser, config: AppConfig): boolean {
  return config.permissions.some((rule) => {
    if (anyEmailMatch(rule.users, user.email)) return true;
    if (rule.groups && user.groups) {
      return rule.groups.some((g) => user.groups!.includes(g));
    }
    return false;
  });
}

export function getAllowedProjectIds(user: AuthUser, config: AppConfig): Set<string> {
  const allowed = new Set<string>();

  for (const rule of config.permissions) {
    let matches = false;

    if (anyEmailMatch(rule.users, user.email)) {
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

  if (hasUserRestriction && anyEmailMatch(pipeline.allowed_users, user.email)) return true;

  if (hasGroupRestriction && user.groups) {
    for (const group of pipeline.allowed_groups!) {
      if (user.groups.includes(group)) return true;
    }
  }

  return false;
}
