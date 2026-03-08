import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sqlite3pkg from "sqlite3";
import { sweepExpiredSqliteSessions } from "./session.js";

const sqlite3 = sqlite3pkg.verbose();

/**
 * Set up the `sessions` table the way connect-sqlite3 creates it, and seed
 * a couple of expired + fresh rows we can sweep.
 *
 * connect-sqlite3 schema (see ts3ph/connect-sqlite3/blob/master/lib/connect-sqlite3.js):
 *   CREATE TABLE sessions (sid TEXT PRIMARY KEY, expired INTEGER, sess TEXT)
 * `expired` is stored as a JS Date.getTime() value (ms since epoch).
 */
function seed(dbPath: string, rows: Array<{ sid: string; expiredMs: number; sess: string }>) {
  return new Promise<void>((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.serialize(() => {
      db.run(
        "CREATE TABLE IF NOT EXISTS sessions (sid TEXT PRIMARY KEY, expired INTEGER, sess TEXT)",
        (err) => err && reject(err),
      );
      const stmt = db.prepare("INSERT INTO sessions (sid, expired, sess) VALUES (?, ?, ?)");
      for (const r of rows) stmt.run(r.sid, r.expiredMs, r.sess);
      stmt.finalize((err) => (err ? reject(err) : db.close(() => resolve())));
    });
  });
}

function readAll(dbPath: string): Promise<Array<{ sid: string; expired: number }>> {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath);
    db.all<{ sid: string; expired: number }>("SELECT sid, expired FROM sessions ORDER BY sid", (err, rows) => {
      if (err) reject(err);
      else db.close(() => resolve(rows));
    });
  });
}

describe("sweepExpiredSqliteSessions", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "bv-sess-sweep-"));
    dbPath = join(dir, "sessions.sqlite");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("deletes expired rows and leaves unexpired ones in place", async () => {
    const now = Date.now();
    await seed(dbPath, [
      { sid: "old-1", expiredMs: now - 60_000, sess: "{}" },
      { sid: "old-2", expiredMs: now - 1, sess: "{}" },
      { sid: "fresh", expiredMs: now + 60_000, sess: "{}" },
    ]);

    const deleted = await sweepExpiredSqliteSessions(dbPath);

    expect(deleted).toBe(2);
    const remaining = await readAll(dbPath);
    expect(remaining.map((r) => r.sid)).toEqual(["fresh"]);
  });

  it("returns 0 when nothing is expired", async () => {
    const now = Date.now();
    await seed(dbPath, [
      { sid: "a", expiredMs: now + 10_000, sess: "{}" },
      { sid: "b", expiredMs: now + 20_000, sess: "{}" },
    ]);

    const deleted = await sweepExpiredSqliteSessions(dbPath);

    expect(deleted).toBe(0);
    expect((await readAll(dbPath)).map((r) => r.sid)).toEqual(["a", "b"]);
  });

  it("resolves with 0 instead of throwing when the table doesn't exist", async () => {
    // No seeding — table missing entirely. The sweeper should log and move on,
    // not crash the process.
    const deleted = await sweepExpiredSqliteSessions(dbPath);
    expect(deleted).toBe(0);
  });
});
