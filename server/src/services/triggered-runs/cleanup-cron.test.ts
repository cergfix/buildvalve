import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sqlite3pkg from "sqlite3";
import type { AppConfig } from "../../types/index.js";
import { createTriggeredRunsStore } from "./store.js";

const sqlite3 = sqlite3pkg.verbose();
const NINETY_ONE_DAYS_MS = 91 * 24 * 60 * 60 * 1000;

function makeConfig(sqlitePath: string, runCleanupCrons?: boolean): AppConfig {
  return {
    ci_providers: [],
    auth: { providers: [] },
    session: { secret: "x", max_age: 3600 },
    projects: [],
    permissions: [],
    storage: {
      type: "sqlite",
      sqlite_path: sqlitePath,
      ...(runCleanupCrons !== undefined ? { run_cleanup_crons: runCleanupCrons } : {}),
    },
  };
}

/**
 * Pre-seed the triggered_runs SQLite file with one "old" row (past the
 * 90-day retention cutoff) and one "fresh" row. Mirrors the schema in
 * SqliteStore so we can verify whether the factory's initial prune runs.
 */
function seedOldAndFresh(file: string) {
  return new Promise<void>((resolve, reject) => {
    const db = new sqlite3.Database(file);
    db.serialize(() => {
      db.exec(
        `CREATE TABLE IF NOT EXISTS triggered_runs (
           project_id          TEXT NOT NULL,
           pipeline_name       TEXT NOT NULL,
           ref                 TEXT NOT NULL,
           run_id              TEXT NOT NULL,
           triggered_at        INTEGER NOT NULL,
           triggered_by_email  TEXT NOT NULL,
           variables_json      TEXT NOT NULL,
           PRIMARY KEY (project_id, run_id)
         );`,
        (err) => err && reject(err),
      );
      const now = Date.now();
      const stmt = db.prepare(
        `INSERT INTO triggered_runs
           (project_id, pipeline_name, ref, run_id, triggered_at, triggered_by_email, variables_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      );
      stmt.run("p1", "Deploy", "main", "old", now - NINETY_ONE_DAYS_MS, "x", "{}");
      stmt.run("p1", "Deploy", "main", "fresh", now, "x", "{}");
      stmt.finalize((err) => (err ? reject(err) : db.close(() => resolve())));
    });
  });
}

async function flushTicks() {
  // Initial prune in the factory is fire-and-forget. The store's `ready`
  // promise must resolve and then the prune's db.run must drain before the
  // next op can see its effects. A couple of macro-task ticks is plenty.
  await new Promise((r) => setTimeout(r, 50));
}

describe("createTriggeredRunsStore — cleanup cron gating", () => {
  let dir: string;
  let file: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bv-cron-gate-"));
    file = join(dir, "triggered_runs.sqlite");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs the initial prune when run_cleanup_crons is true (default)", async () => {
    await seedOldAndFresh(file);
    const store = createTriggeredRunsStore(makeConfig(dir));
    await flushTicks();

    const rows = await store.listRecent("p1", "main", 50);
    expect(rows.has("fresh")).toBe(true);
    expect(rows.has("old")).toBe(false); // pruned on startup
    await store.close();
  });

  it("runs the initial prune when run_cleanup_crons is explicitly true", async () => {
    await seedOldAndFresh(file);
    const store = createTriggeredRunsStore(makeConfig(dir, true));
    await flushTicks();

    const rows = await store.listRecent("p1", "main", 50);
    expect(rows.has("old")).toBe(false);
    await store.close();
  });

  it("skips the initial prune when run_cleanup_crons is false (follower replica)", async () => {
    await seedOldAndFresh(file);
    const store = createTriggeredRunsStore(makeConfig(dir, false));
    await flushTicks();

    // Without cleanup the old row is still there. The owning replica's
    // cron will eventually delete it; this replica must not.
    const rows = await store.listRecent("p1", "main", 50);
    expect(rows.has("old")).toBe(true);
    expect(rows.has("fresh")).toBe(true);
    await store.close();
  });
});
