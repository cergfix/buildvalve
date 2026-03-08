/**
 * Persistent store of pipeline runs triggered through BuildValve.
 *
 * Used by the history endpoint to filter the provider's full run list down to
 * just the runs we triggered, and to enrich rows with the user who triggered
 * them + the variables they submitted (so the History page's "triggered by"
 * and "version" columns have content).
 *
 * Backends:
 *   • SQLite (default): file at ./data/triggered_runs.sqlite — mount /app/data
 *     as a Docker volume to persist across container restarts.
 *   • Redis: uses the same `session.redis_url` from config. Keyed under
 *     `bv:triggered_runs:*`.
 *
 * The backend is chosen via `config.session.store` (same knob as the session
 * store) so users only configure one persistence layer.
 */
import { mkdirSync } from "node:fs";
import sqlite3pkg from "sqlite3";
import { createClient, type RedisClientType } from "redis";
import type { AppConfig } from "../../types/index.js";
import { logger } from "../../utils/logger.js";
import { resolveStorage } from "../../utils/storage.js";

const sqlite3 = sqlite3pkg.verbose();

export interface TriggeredRunMetadata {
  projectId: string;
  pipelineName: string;
  ref: string;
  runId: string;
  triggeredAt: number;
  triggeredByEmail: string;
  variables: Record<string, string>;
}

export interface TriggeredRunsStore {
  record(entry: TriggeredRunMetadata): Promise<void>;
  /**
   * Return the most recently triggered runs for (project, ref), newest first,
   * as a map keyed by run_id. The history endpoint uses the keys to filter
   * the CI provider's run list and the values to enrich each row.
   */
  listRecent(projectId: string, ref: string, limit: number): Promise<Map<string, TriggeredRunMetadata>>;
  /**
   * Same shape as listRecent, but across all refs of a project. Used by the
   * /api/pipelines/recent endpoint, which doesn't know about refs (it merges
   * runs across every pipeline in the project).
   */
  listRecentByProject(projectId: string, limit: number): Promise<Map<string, TriggeredRunMetadata>>;
  prune(olderThanMs: number): Promise<void>;
  close(): Promise<void>;
}

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// ─────────────────────────────────────────────────────────────────────────
// SQLite backend
// ─────────────────────────────────────────────────────────────────────────

class SqliteStore implements TriggeredRunsStore {
  private db: sqlite3pkg.Database;
  private ready: Promise<void>;

  constructor(file: string) {
    // The caller passes a full path; ensure its parent directory exists.
    const dir = file.replace(/\/[^/]*$/, "");
    if (dir && dir !== file) mkdirSync(dir, { recursive: true });
    this.db = new sqlite3.Database(file);
    this.ready = new Promise((resolve, reject) => {
      this.db.exec(
        `
        CREATE TABLE IF NOT EXISTS triggered_runs (
          project_id          TEXT NOT NULL,
          pipeline_name       TEXT NOT NULL,
          ref                 TEXT NOT NULL,
          run_id              TEXT NOT NULL,
          triggered_at        INTEGER NOT NULL,
          triggered_by_email  TEXT NOT NULL,
          variables_json      TEXT NOT NULL,
          PRIMARY KEY (project_id, run_id)
        );
        CREATE INDEX IF NOT EXISTS idx_triggered_runs_lookup
          ON triggered_runs(project_id, ref, triggered_at DESC);
        `,
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  async record(e: TriggeredRunMetadata): Promise<void> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.db.run(
        `INSERT OR REPLACE INTO triggered_runs
           (project_id, pipeline_name, ref, run_id, triggered_at, triggered_by_email, variables_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          e.projectId,
          e.pipelineName,
          e.ref,
          e.runId,
          e.triggeredAt,
          e.triggeredByEmail,
          JSON.stringify(e.variables),
        ],
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  async listRecent(
    projectId: string,
    ref: string,
    limit: number
  ): Promise<Map<string, TriggeredRunMetadata>> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM triggered_runs
         WHERE project_id = ? AND ref = ?
         ORDER BY triggered_at DESC
         LIMIT ?`,
        [projectId, ref, limit],
        (err, rows: any[]) => {
          if (err) return reject(err);
          const map = new Map<string, TriggeredRunMetadata>();
          for (const row of rows) {
            map.set(row.run_id, {
              projectId: row.project_id,
              pipelineName: row.pipeline_name,
              ref: row.ref,
              runId: row.run_id,
              triggeredAt: row.triggered_at,
              triggeredByEmail: row.triggered_by_email,
              variables: JSON.parse(row.variables_json),
            });
          }
          resolve(map);
        }
      );
    });
  }

  async listRecentByProject(
    projectId: string,
    limit: number
  ): Promise<Map<string, TriggeredRunMetadata>> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.db.all(
        `SELECT * FROM triggered_runs
         WHERE project_id = ?
         ORDER BY triggered_at DESC
         LIMIT ?`,
        [projectId, limit],
        (err, rows: any[]) => {
          if (err) return reject(err);
          const map = new Map<string, TriggeredRunMetadata>();
          for (const row of rows) {
            map.set(row.run_id, {
              projectId: row.project_id,
              pipelineName: row.pipeline_name,
              ref: row.ref,
              runId: row.run_id,
              triggeredAt: row.triggered_at,
              triggeredByEmail: row.triggered_by_email,
              variables: JSON.parse(row.variables_json),
            });
          }
          resolve(map);
        }
      );
    });
  }

  async prune(olderThanMs: number): Promise<void> {
    await this.ready;
    return new Promise((resolve, reject) => {
      this.db.run(
        `DELETE FROM triggered_runs WHERE triggered_at < ?`,
        [Date.now() - olderThanMs],
        (err) => (err ? reject(err) : resolve())
      );
    });
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.db.close(() => resolve()));
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Redis backend — per (project, ref) sorted set of run IDs keyed by trigger
// timestamp, plus a hash per (project, run) with the full metadata.
// ─────────────────────────────────────────────────────────────────────────

class RedisStore implements TriggeredRunsStore {
  private client: RedisClientType;
  private ready: Promise<void>;

  constructor(redisUrl: string) {
    // Cast to RedisClientType — redis@4 returns an inferred conditional type.
    this.client = createClient({ url: redisUrl }) as RedisClientType;
    this.client.on("error", (e) => logger.error("Redis (triggered_runs) error", { error: e }));
    this.ready = this.client.connect().then(() => undefined);
  }

  private indexKey(projectId: string, ref: string): string {
    return `bv:triggered_runs:idx:${projectId}:${ref}`;
  }
  // Project-wide secondary index — used by /recent (no ref filter).
  private projectIndexKey(projectId: string): string {
    return `bv:triggered_runs:proj-idx:${projectId}`;
  }
  private metaKey(projectId: string, runId: string): string {
    return `bv:triggered_runs:meta:${projectId}:${runId}`;
  }

  async record(e: TriggeredRunMetadata): Promise<void> {
    await this.ready;
    const multi = this.client.multi();
    multi.zAdd(this.indexKey(e.projectId, e.ref), { score: e.triggeredAt, value: e.runId });
    multi.zAdd(this.projectIndexKey(e.projectId), { score: e.triggeredAt, value: e.runId });
    multi.hSet(this.metaKey(e.projectId, e.runId), {
      project_id: e.projectId,
      pipeline_name: e.pipelineName,
      ref: e.ref,
      run_id: e.runId,
      triggered_at: String(e.triggeredAt),
      triggered_by_email: e.triggeredByEmail,
      variables_json: JSON.stringify(e.variables),
    });
    multi.expire(this.metaKey(e.projectId, e.runId), Math.ceil(RETENTION_MS / 1000));
    await multi.exec();
  }

  async listRecent(
    projectId: string,
    ref: string,
    limit: number
  ): Promise<Map<string, TriggeredRunMetadata>> {
    await this.ready;
    // zRange with REV returns newest first when scores are timestamps.
    const ids = await this.client.zRange(this.indexKey(projectId, ref), 0, limit - 1, {
      REV: true,
    });
    const map = new Map<string, TriggeredRunMetadata>();
    // Pipeline the metadata reads for each id.
    const multi = this.client.multi();
    for (const id of ids) multi.hGetAll(this.metaKey(projectId, id));
    const rows = (await multi.exec()) as unknown as Record<string, string>[];
    rows.forEach((row, i) => {
      if (!row || Object.keys(row).length === 0) return;
      map.set(ids[i], {
        projectId: row.project_id,
        pipelineName: row.pipeline_name,
        ref: row.ref,
        runId: row.run_id,
        triggeredAt: Number(row.triggered_at),
        triggeredByEmail: row.triggered_by_email,
        variables: JSON.parse(row.variables_json),
      });
    });
    return map;
  }

  async listRecentByProject(
    projectId: string,
    limit: number,
  ): Promise<Map<string, TriggeredRunMetadata>> {
    await this.ready;
    const ids = await this.client.zRange(this.projectIndexKey(projectId), 0, limit - 1, {
      REV: true,
    });
    const map = new Map<string, TriggeredRunMetadata>();
    if (ids.length === 0) return map;
    const multi = this.client.multi();
    for (const id of ids) multi.hGetAll(this.metaKey(projectId, id));
    const rows = (await multi.exec()) as unknown as Record<string, string>[];
    rows.forEach((row, i) => {
      if (!row || Object.keys(row).length === 0) return;
      map.set(ids[i], {
        projectId: row.project_id,
        pipelineName: row.pipeline_name,
        ref: row.ref,
        runId: row.run_id,
        triggeredAt: Number(row.triggered_at),
        triggeredByEmail: row.triggered_by_email,
        variables: JSON.parse(row.variables_json),
      });
    });
    return map;
  }

  async prune(olderThanMs: number): Promise<void> {
    await this.ready;
    // Note: we can't enumerate all index keys cheaply; rely on the per-meta
    // expire above and a single index sweep using SCAN. Both per-ref and
    // project-wide indexes get the same cutoff treatment.
    const cutoff = Date.now() - olderThanMs;
    for await (const chunk of this.client.scanIterator({
      MATCH: "bv:triggered_runs:idx:*",
    }) as AsyncIterable<string | string[]>) {
      const keys = Array.isArray(chunk) ? chunk : [chunk];
      for (const key of keys) {
        await this.client.zRemRangeByScore(key, 0, cutoff);
      }
    }
    for await (const chunk of this.client.scanIterator({
      MATCH: "bv:triggered_runs:proj-idx:*",
    }) as AsyncIterable<string | string[]>) {
      const keys = Array.isArray(chunk) ? chunk : [chunk];
      for (const key of keys) {
        await this.client.zRemRangeByScore(key, 0, cutoff);
      }
    }
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// MySQL backend (RDS / Aurora friendly). Lazy-loads mysql2 so SQLite users
// don't pay for it.
// ─────────────────────────────────────────────────────────────────────────

class MysqlStore implements TriggeredRunsStore {
  private pool!: import("mysql2/promise").Pool;
  private ready: Promise<void>;

  constructor(connectionUrl: string) {
    this.ready = (async () => {
      const mysql = await import("mysql2/promise");
      this.pool = mysql.createPool(connectionUrl);
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS bv_triggered_runs (
           project_id          VARCHAR(255)   NOT NULL,
           pipeline_name       VARCHAR(255)   NOT NULL,
           ref                 VARCHAR(255)   NOT NULL,
           run_id              VARCHAR(255)   NOT NULL,
           triggered_at        BIGINT         NOT NULL,
           triggered_by_email  VARCHAR(255)   NOT NULL,
           variables_json      LONGTEXT       NOT NULL,
           PRIMARY KEY (project_id, run_id),
           INDEX idx_lookup (project_id, ref, triggered_at DESC)
         ) ENGINE=InnoDB CHARSET=utf8mb4`
      );
    })();
  }

  async record(e: TriggeredRunMetadata): Promise<void> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO bv_triggered_runs
         (project_id, pipeline_name, ref, run_id, triggered_at, triggered_by_email, variables_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         pipeline_name = VALUES(pipeline_name),
         ref = VALUES(ref),
         triggered_at = VALUES(triggered_at),
         triggered_by_email = VALUES(triggered_by_email),
         variables_json = VALUES(variables_json)`,
      [
        e.projectId,
        e.pipelineName,
        e.ref,
        e.runId,
        e.triggeredAt,
        e.triggeredByEmail,
        JSON.stringify(e.variables),
      ]
    );
  }

  async listRecent(
    projectId: string,
    ref: string,
    limit: number
  ): Promise<Map<string, TriggeredRunMetadata>> {
    await this.ready;
    const [rows] = await this.pool.query(
      `SELECT * FROM bv_triggered_runs
         WHERE project_id = ? AND ref = ?
         ORDER BY triggered_at DESC
         LIMIT ?`,
      [projectId, ref, limit]
    );
    const map = new Map<string, TriggeredRunMetadata>();
    for (const row of rows as any[]) {
      map.set(row.run_id, {
        projectId: row.project_id,
        pipelineName: row.pipeline_name,
        ref: row.ref,
        runId: row.run_id,
        triggeredAt: Number(row.triggered_at),
        triggeredByEmail: row.triggered_by_email,
        variables: JSON.parse(row.variables_json),
      });
    }
    return map;
  }

  async listRecentByProject(
    projectId: string,
    limit: number,
  ): Promise<Map<string, TriggeredRunMetadata>> {
    await this.ready;
    const [rows] = await this.pool.query(
      `SELECT * FROM bv_triggered_runs
         WHERE project_id = ?
         ORDER BY triggered_at DESC
         LIMIT ?`,
      [projectId, limit],
    );
    const map = new Map<string, TriggeredRunMetadata>();
    for (const row of rows as any[]) {
      map.set(row.run_id, {
        projectId: row.project_id,
        pipelineName: row.pipeline_name,
        ref: row.ref,
        runId: row.run_id,
        triggeredAt: Number(row.triggered_at),
        triggeredByEmail: row.triggered_by_email,
        variables: JSON.parse(row.variables_json),
      });
    }
    return map;
  }

  async prune(olderThanMs: number): Promise<void> {
    await this.ready;
    await this.pool.query(
      `DELETE FROM bv_triggered_runs WHERE triggered_at < ?`,
      [Date.now() - olderThanMs]
    );
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// ─────────────────────────────────────────────────────────────────────────
// DynamoDB backend — single table, composite key.
//   pk = "tr#<projectId>#<ref>"
//   sk = "<triggeredAt>#<runId>"        — sortable lexicographically (ts is ms-since-epoch padded? no — js Date.now is already 13-digit)
//   ttl = unix-seconds expiry (DynamoDB TTL takes care of pruning)
// Attributes: project_id, pipeline_name, ref, run_id, triggered_at,
//             triggered_by_email, variables_json
// ─────────────────────────────────────────────────────────────────────────

class DynamoStore implements TriggeredRunsStore {
  private client!: import("@aws-sdk/lib-dynamodb").DynamoDBDocumentClient;
  private tableName: string;
  private ready: Promise<void>;

  constructor(opts: { region?: string; tableName: string; endpoint?: string }) {
    this.tableName = opts.tableName;
    // Lazy-import so the SDK isn't loaded when not used.
    this.ready = (async () => {
      const { DynamoDBClient } = await import("@aws-sdk/client-dynamodb");
      const { DynamoDBDocumentClient } = await import("@aws-sdk/lib-dynamodb");
      const raw = new DynamoDBClient({
        region: opts.region,
        endpoint: opts.endpoint,
      });
      this.client = DynamoDBDocumentClient.from(raw, {
        marshallOptions: { removeUndefinedValues: true },
      });
    })();
  }

  private pk(projectId: string, ref: string): string {
    return `tr#${projectId}#${ref}`;
  }
  // Project-wide partition used by listRecentByProject. Each record gets
  // written to both partitions (denormalized) so /recent doesn't need a GSI.
  private projectPk(projectId: string): string {
    return `tr-proj#${projectId}`;
  }
  private sk(triggeredAt: number, runId: string): string {
    // 13-digit ms timestamps sort lexicographically the same as numerically
    // until year 2286, which is fine.
    return `${triggeredAt}#${runId}`;
  }

  async record(e: TriggeredRunMetadata): Promise<void> {
    await this.ready;
    const { BatchWriteCommand } = await import("@aws-sdk/lib-dynamodb");
    const item = {
      project_id: e.projectId,
      pipeline_name: e.pipelineName,
      ref: e.ref,
      run_id: e.runId,
      triggered_at: e.triggeredAt,
      triggered_by_email: e.triggeredByEmail,
      variables_json: JSON.stringify(e.variables),
      ttl: Math.floor((e.triggeredAt + RETENTION_MS) / 1000),
    };
    await this.client.send(
      new BatchWriteCommand({
        RequestItems: {
          [this.tableName]: [
            {
              PutRequest: {
                Item: { pk: this.pk(e.projectId, e.ref), sk: this.sk(e.triggeredAt, e.runId), ...item },
              },
            },
            {
              PutRequest: {
                Item: { pk: this.projectPk(e.projectId), sk: this.sk(e.triggeredAt, e.runId), ...item },
              },
            },
          ],
        },
      }),
    );
  }

  async listRecent(
    projectId: string,
    ref: string,
    limit: number
  ): Promise<Map<string, TriggeredRunMetadata>> {
    await this.ready;
    const { QueryCommand } = await import("@aws-sdk/lib-dynamodb");
    const res = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": this.pk(projectId, ref) },
        ScanIndexForward: false, // newest sk first
        Limit: limit,
      })
    );
    const map = new Map<string, TriggeredRunMetadata>();
    for (const item of res.Items ?? []) {
      map.set(item.run_id as string, {
        projectId: item.project_id as string,
        pipelineName: item.pipeline_name as string,
        ref: item.ref as string,
        runId: item.run_id as string,
        triggeredAt: Number(item.triggered_at),
        triggeredByEmail: item.triggered_by_email as string,
        variables: JSON.parse(item.variables_json as string),
      });
    }
    return map;
  }

  async listRecentByProject(
    projectId: string,
    limit: number,
  ): Promise<Map<string, TriggeredRunMetadata>> {
    await this.ready;
    const { QueryCommand } = await import("@aws-sdk/lib-dynamodb");
    const res = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "pk = :pk",
        ExpressionAttributeValues: { ":pk": this.projectPk(projectId) },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    const map = new Map<string, TriggeredRunMetadata>();
    for (const item of res.Items ?? []) {
      map.set(item.run_id as string, {
        projectId: item.project_id as string,
        pipelineName: item.pipeline_name as string,
        ref: item.ref as string,
        runId: item.run_id as string,
        triggeredAt: Number(item.triggered_at),
        triggeredByEmail: item.triggered_by_email as string,
        variables: JSON.parse(item.variables_json as string),
      });
    }
    return map;
  }

  async prune(_olderThanMs: number): Promise<void> {
    // DynamoDB TTL handles expiry automatically (we write `ttl` on each Put).
    // No-op here.
  }

  async close(): Promise<void> {
    // DynamoDBDocumentClient has no persistent connection to close.
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Factory
// ─────────────────────────────────────────────────────────────────────────

export function createTriggeredRunsStore(config: AppConfig): TriggeredRunsStore {
  const storage = resolveStorage(config);
  let backend: TriggeredRunsStore;

  if (storage.type === "redis") {
    if (!storage.redisUrl) throw new Error("storage.redis_url is required when storage.type is redis");
    backend = new RedisStore(storage.redisUrl);
    logger.info("Triggered-runs store: Redis");
  } else if (storage.type === "dynamodb") {
    backend = new DynamoStore({
      region: storage.region,
      tableName: storage.tableName ?? "buildvalve",
      endpoint: storage.endpoint,
    });
    logger.info(`Triggered-runs store: DynamoDB (table ${storage.tableName ?? "buildvalve"})`);
  } else if (storage.type === "mysql") {
    if (!storage.mysqlUrl) throw new Error("storage.mysql_url is required when storage.type is mysql");
    backend = new MysqlStore(storage.mysqlUrl);
    logger.info("Triggered-runs store: MySQL");
  } else {
    const file = `${storage.sqlitePath}/triggered_runs.sqlite`;
    backend = new SqliteStore(file);
    logger.info(`Triggered-runs store: SQLite at ${file}`);
  }

  if (storage.runCleanupCrons) {
    // Nightly prune. Catch errors so a transient store hiccup doesn't kill the process.
    setInterval(() => {
      backend.prune(RETENTION_MS).catch((err) => logger.error("triggered_runs prune failed", { error: err }));
    }, 24 * 60 * 60 * 1000).unref();

    // Initial prune on startup, fire-and-forget.
    backend.prune(RETENTION_MS).catch(() => { /* ignore on first boot */ });
  } else {
    logger.info("Triggered-runs cleanup cron disabled on this instance (storage.run_cleanup_crons=false)");
  }

  return backend;
}
