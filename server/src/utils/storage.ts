import type { AppConfig } from "../types/index.js";

export interface ResolvedStorage {
  type: "sqlite" | "redis" | "dynamodb" | "mysql";
  redisUrl?: string;
  region?: string;
  tableName?: string;
  endpoint?: string;
  mysqlUrl?: string;
  /** SQLite DB directory. Defaults to `./data`. */
  sqlitePath: string;
  /**
   * Whether this instance runs the periodic cleanup jobs (expired session
   * sweep + triggered-runs retention prune). Default: true. Set to false on
   * all-but-one instance when running multiple BuildValve replicas behind a
   * load balancer against a shared DB — only one instance should perform
   * cleanup to avoid duplicate-delete race conditions.
   */
  runCleanupCrons: boolean;
}

/**
 * Pick the persistent-storage backend for both sessions and triggered-run
 * history. Reads top-level `storage:` config first, falls back to the
 * deprecated `session.store` / `session.redis_url` for backward compat.
 *
 * Default = sqlite (file in ./data/).
 */
export function resolveStorage(config: AppConfig): ResolvedStorage {
  if (config.storage) {
    return {
      type: config.storage.type,
      redisUrl: config.storage.redis_url,
      region: config.storage.region,
      tableName: config.storage.table_name ?? "buildvalve",
      endpoint: config.storage.endpoint,
      mysqlUrl: config.storage.mysql_url,
      sqlitePath: config.storage.sqlite_path ?? "./data",
      runCleanupCrons: config.storage.run_cleanup_crons ?? true,
    };
  }
  if (config.session.store) {
    return {
      type: config.session.store,
      redisUrl: config.session.redis_url,
      sqlitePath: "./data",
      runCleanupCrons: true,
    };
  }
  return { type: "sqlite", sqlitePath: "./data", runCleanupCrons: true };
}
