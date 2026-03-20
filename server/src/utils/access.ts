import { logger } from "./logger.js";
import type { AuthUser } from "../types/index.js";

export type AccessEvent =
  | "login"
  | "login_failed"
  | "logout"
  | "pipeline_triggered"
  | "pipeline_trigger_failed"
  | "pipeline_viewed"
  | "pipeline_history_viewed"
  | "job_logs_viewed"
  | "admin_config_viewed";

export function access(user: AuthUser | { email: string; provider?: string }, event: AccessEvent, extra?: Record<string, unknown>): void {
  logger.info({
    type: "access",
    event,
    user_email: user.email,
    user_provider: user.provider ?? "unknown",
    ...extra,
  });
}
