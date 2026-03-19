import { logger } from "./logger.js";
import type { AuthUser } from "../types/index.js";

export type AuditEvent =
  | "login"
  | "login_failed"
  | "logout"
  | "pipeline_triggered"
  | "pipeline_trigger_failed"
  | "pipeline_viewed"
  | "pipeline_history_viewed"
  | "job_logs_viewed"
  | "admin_config_viewed";

export interface AuditEntry {
  event: AuditEvent;
  user_email: string;
  user_provider?: string;
  [key: string]: unknown;
}

export function audit(user: AuthUser | { email: string; provider?: string }, event: AuditEvent, extra?: Record<string, unknown>): void {
  logger.info({
    audit: true,
    event,
    user_email: user.email,
    user_provider: user.provider ?? "unknown",
    ...extra,
  });
}
