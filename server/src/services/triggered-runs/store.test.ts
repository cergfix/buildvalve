import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chdir } from "node:process";
import type { AppConfig } from "../../types/index.js";
import { createTriggeredRunsStore } from "./store.js";

function makeConfig(): AppConfig {
  return {
    ci_providers: [],
    auth: { providers: [] },
    session: { secret: "x", max_age: 3600 },
    projects: [],
    permissions: [],
  };
}

describe("TriggeredRunsStore (SQLite backend)", () => {
  // Each test gets its own tmp dir so the `./data/triggered_runs.sqlite`
  // file lives in isolation (the store always writes under the cwd).
  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "bv-triggered-runs-"));
    chdir(dir);
    return () => rmSync(dir, { recursive: true, force: true });
  });

  it("records and lists a run by project + ref", async () => {
    const store = createTriggeredRunsStore(makeConfig());
    await store.record({
      projectId: "p1",
      pipelineName: "Deploy",
      ref: "main",
      runId: "123",
      triggeredAt: Date.now(),
      triggeredByEmail: "alice@co.com",
      variables: { VERSION: "1.2.3" },
    });

    const runs = await store.listRecent("p1", "main", 50);
    expect(runs.has("123")).toBe(true);
    expect(runs.size).toBe(1);
    expect(runs.get("123")).toMatchObject({
      pipelineName: "Deploy",
      ref: "main",
      runId: "123",
      triggeredByEmail: "alice@co.com",
      variables: { VERSION: "1.2.3" },
    });
    await store.close();
  });

  it("scopes listIds by ref — runs on a different ref aren't returned", async () => {
    const store = createTriggeredRunsStore(makeConfig());
    // Anchor to Date.now() so the factory's startup prune (which deletes
    // rows older than 90 days) doesn't race-delete our records.
    const now = Date.now();
    await store.record({
      projectId: "p1", pipelineName: "Deploy", ref: "main", runId: "a",
      triggeredAt: now, triggeredByEmail: "x", variables: {},
    });
    await store.record({
      projectId: "p1", pipelineName: "Deploy", ref: "staging", runId: "b",
      triggeredAt: now + 1, triggeredByEmail: "x", variables: {},
    });

    const main = await store.listRecent("p1", "main", 50);
    const staging = await store.listRecent("p1", "staging", 50);
    expect([...main.keys()]).toEqual(["a"]);
    expect([...staging.keys()]).toEqual(["b"]);
    await store.close();
  });

  it("scopes listIds by project — runs from a different project aren't returned", async () => {
    const store = createTriggeredRunsStore(makeConfig());
    const now = Date.now();
    await store.record({
      projectId: "p1", pipelineName: "x", ref: "main", runId: "1",
      triggeredAt: now, triggeredByEmail: "x", variables: {},
    });
    await store.record({
      projectId: "p2", pipelineName: "x", ref: "main", runId: "2",
      triggeredAt: now + 1, triggeredByEmail: "x", variables: {},
    });

    expect([...(await store.listRecent("p1", "main", 50)).keys()]).toEqual(["1"]);
    expect([...(await store.listRecent("p2", "main", 50)).keys()]).toEqual(["2"]);
    await store.close();
  });

  it("listRecentByProject returns runs across every ref of a project, newest first", async () => {
    const store = createTriggeredRunsStore(makeConfig());
    const now = Date.now();
    await store.record({
      projectId: "p1", pipelineName: "Deploy", ref: "main", runId: "a",
      triggeredAt: now, triggeredByEmail: "x", variables: {},
    });
    await store.record({
      projectId: "p1", pipelineName: "Deploy", ref: "staging", runId: "b",
      triggeredAt: now + 1, triggeredByEmail: "x", variables: {},
    });
    await store.record({
      projectId: "p1", pipelineName: "Deploy", ref: "main", runId: "c",
      triggeredAt: now + 2, triggeredByEmail: "x", variables: {},
    });
    // p2 must not bleed into p1's results.
    await store.record({
      projectId: "p2", pipelineName: "Deploy", ref: "main", runId: "z",
      triggeredAt: now + 3, triggeredByEmail: "x", variables: {},
    });

    const runs = await store.listRecentByProject("p1", 50);
    expect([...runs.keys()]).toEqual(["c", "b", "a"]);
    expect(runs.has("z")).toBe(false);
    await store.close();
  });

  it("listRecentByProject returns empty map for an unknown project", async () => {
    const store = createTriggeredRunsStore(makeConfig());
    const runs = await store.listRecentByProject("nope", 50);
    expect(runs.size).toBe(0);
    await store.close();
  });

  it("orders newest-first up to the limit", async () => {
    const store = createTriggeredRunsStore(makeConfig());
    const now = Date.now();
    for (let i = 0; i < 5; i++) {
      await store.record({
        projectId: "p1", pipelineName: "Deploy", ref: "main", runId: String(i),
        triggeredAt: now + i, triggeredByEmail: "x", variables: {},
      });
    }
    const runs = await store.listRecent("p1", "main", 3);
    expect([...runs.keys()]).toEqual(["4", "3", "2"]);
    await store.close();
  });

  it("prune drops rows older than the cutoff", async () => {
    const store = createTriggeredRunsStore(makeConfig());
    const now = Date.now();
    await store.record({
      projectId: "p1", pipelineName: "x", ref: "main", runId: "old",
      triggeredAt: now - 100 * 24 * 60 * 60 * 1000, // 100 days ago
      triggeredByEmail: "x", variables: {},
    });
    await store.record({
      projectId: "p1", pipelineName: "x", ref: "main", runId: "new",
      triggeredAt: now,
      triggeredByEmail: "x", variables: {},
    });
    await store.prune(90 * 24 * 60 * 60 * 1000);
    const runs = await store.listRecent("p1", "main", 50);
    expect(runs.has("old")).toBe(false);
    expect(runs.has("new")).toBe(true);
    await store.close();
  });

  it("returns empty map for an unknown (project, ref)", async () => {
    const store = createTriggeredRunsStore(makeConfig());
    const runs = await store.listRecent("p1", "missing-ref", 50);
    expect(runs.size).toBe(0);
    await store.close();
  });

  it("honors storage.sqlite_path for the SQLite file location", async () => {
    const customDir = mkdtempSync(join(tmpdir(), "bv-sqlite-path-"));
    const cfg: AppConfig = {
      ...makeConfig(),
      storage: { type: "sqlite", sqlite_path: customDir },
    };
    const store = createTriggeredRunsStore(cfg);
    await store.record({
      projectId: "p1", pipelineName: "Deploy", ref: "main", runId: "1",
      triggeredAt: Date.now(), triggeredByEmail: "x", variables: {},
    });
    const { existsSync } = await import("node:fs");
    expect(existsSync(join(customDir, "triggered_runs.sqlite"))).toBe(true);
    await store.close();
    rmSync(customDir, { recursive: true, force: true });
  });
});
