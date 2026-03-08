import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import { RedisStore } from "connect-redis";
import { createClient } from "redis";
import mysqlSession from "express-mysql-session";
import sqlite3pkg from "sqlite3";
import type { AppConfig } from "../types/index.js";
import { mkdirSync } from "node:fs";
import { logger } from "../utils/logger.js";
import { isPlainHttp } from "../utils/scheme.js";
import { resolveStorage } from "../utils/storage.js";
import { DynamoDBSessionStore } from "./dynamodb-session-store.js";

const sqlite3 = sqlite3pkg.verbose();

/**
 * Single pass: delete rows in connect-sqlite3's `sessions` table whose
 * `expired` column is in the past. Exported for testing — see
 * `startSqliteSessionSweeper` for the scheduling wrapper used by the
 * middleware.
 */
export function sweepExpiredSqliteSessions(dbPath: string): Promise<number> {
  return new Promise((resolve) => {
    const db = new sqlite3.Database(dbPath);
    db.run("DELETE FROM sessions WHERE expired < ?", [Date.now()], function (err) {
      if (err) {
        logger.warn("SQLite session sweep failed", { error: err.message });
        db.close();
        resolve(0);
        return;
      }
      const changes = (this as { changes?: number }).changes ?? 0;
      if (changes) logger.info(`SQLite session sweep: deleted ${changes} expired rows`);
      db.close();
      resolve(changes);
    });
  });
}

/**
 * Background sweep of expired rows in connect-sqlite3's `sessions` table.
 * The package itself only deletes lazily on get(), so logged-out cookies
 * accumulate forever otherwise. Runs every 15 min, same cadence as
 * express-mysql-session.
 */
function startSqliteSessionSweeper(dbPath: string) {
  const sweep = () => {
    sweepExpiredSqliteSessions(dbPath).catch(() => { /* errors already logged */ });
  };
  // Fire once on boot, then every 15 minutes.
  setTimeout(sweep, 5_000).unref();
  setInterval(sweep, 900_000).unref();
}

export function createSessionMiddleware(config: AppConfig) {
  let store;

  const storage = resolveStorage(config);
  if (storage.type === "redis") {
    if (!storage.redisUrl) throw new Error("storage.redis_url is required when storage.type is redis");
    const redisClient = createClient({ url: storage.redisUrl });
    redisClient.connect().catch((e) => logger.error("Redis connection error", { error: e }));
    store = new RedisStore({ client: redisClient });
    logger.info("Using Redis for session store");
  } else if (storage.type === "dynamodb") {
    store = new DynamoDBSessionStore({
      tableName: storage.tableName ?? "buildvalve",
      region: storage.region,
      endpoint: storage.endpoint,
    });
    logger.info(`Using DynamoDB for session store (table ${storage.tableName ?? "buildvalve"})`);
  } else if (storage.type === "mysql") {
    if (!storage.mysqlUrl) throw new Error("storage.mysql_url is required when storage.type is mysql");
    // express-mysql-session creates the table on first connect.
    const MysqlStore = (mysqlSession as unknown as (s: typeof session) => any)(session);
    store = new MysqlStore({
      uri: storage.mysqlUrl,
      schema: { tableName: "bv_sessions" },
      // Cleanup is owned by whichever instance has run_cleanup_crons=true.
      // Default 15 min purge; 24h max idle.
      clearExpired: storage.runCleanupCrons,
      checkExpirationInterval: 900_000,
      expiration: 86_400_000,
    });
    logger.info(
      `Using MySQL for session store (table bv_sessions, cleanup ${storage.runCleanupCrons ? "enabled" : "disabled"})`,
    );
  } else {
    // Default to SQLite at ./data/ — overridable via storage.sqlite_path, e.g.
    // to point at an EFS mount. Mount the directory as a Docker volume to
    // persist across container restarts.
    mkdirSync(storage.sqlitePath, { recursive: true });
    const SQLiteStore = connectSqlite3(session);
    store = new SQLiteStore({ dir: storage.sqlitePath, db: "sessions.sqlite" });
    logger.info(`Using SQLite for session store at ${storage.sqlitePath}/sessions.sqlite`);
    if (storage.runCleanupCrons) startSqliteSessionSweeper(`${storage.sqlitePath}/sessions.sqlite`);
  }

  return session({
    store: store as any,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // Secure only when the deployment actually serves HTTPS (see config.public_url).
      // Default = secure; opt out by setting `public_url: http://...` in config.yml.
      secure: !isPlainHttp(config),
      sameSite: "lax",
      maxAge: config.session.max_age * 1000,
    },
  });
}
