import { describe, it, expect } from "vitest";
import type { AppConfig } from "../types/index.js";
import { resolveStorage } from "./storage.js";

function baseConfig(): AppConfig {
  return {
    ci_providers: [],
    auth: { providers: [] },
    session: { secret: "x", max_age: 3600 },
    projects: [],
    permissions: [],
  };
}

describe("resolveStorage", () => {
  describe("defaults", () => {
    it("returns sqlite + cleanup enabled when neither storage nor session.store is set", () => {
      const r = resolveStorage(baseConfig());
      expect(r.type).toBe("sqlite");
      expect(r.sqlitePath).toBe("./data");
      expect(r.runCleanupCrons).toBe(true);
    });

    it("returns cleanup enabled for legacy session.store (no top-level storage)", () => {
      const cfg = baseConfig();
      cfg.session.store = "redis";
      cfg.session.redis_url = "redis://legacy:6379";
      const r = resolveStorage(cfg);
      expect(r.type).toBe("redis");
      expect(r.redisUrl).toBe("redis://legacy:6379");
      expect(r.runCleanupCrons).toBe(true);
    });
  });

  describe("run_cleanup_crons flag", () => {
    it("defaults to true when storage is present but flag is omitted", () => {
      const cfg = baseConfig();
      cfg.storage = { type: "mysql", mysql_url: "mysql://u:p@h:3306/db" };
      expect(resolveStorage(cfg).runCleanupCrons).toBe(true);
    });

    it("honors explicit false (multi-instance follower)", () => {
      const cfg = baseConfig();
      cfg.storage = {
        type: "mysql",
        mysql_url: "mysql://u:p@h:3306/db",
        run_cleanup_crons: false,
      };
      expect(resolveStorage(cfg).runCleanupCrons).toBe(false);
    });

    it("honors explicit true (multi-instance owner)", () => {
      const cfg = baseConfig();
      cfg.storage = {
        type: "redis",
        redis_url: "redis://r:6379",
        run_cleanup_crons: true,
      };
      expect(resolveStorage(cfg).runCleanupCrons).toBe(true);
    });
  });

  describe("storage fields plumbing", () => {
    it("passes through all dynamodb fields", () => {
      const cfg = baseConfig();
      cfg.storage = {
        type: "dynamodb",
        region: "eu-west-1",
        table_name: "bv-prod",
        endpoint: "http://localhost:8000",
      };
      const r = resolveStorage(cfg);
      expect(r).toMatchObject({
        type: "dynamodb",
        region: "eu-west-1",
        tableName: "bv-prod",
        endpoint: "http://localhost:8000",
      });
    });

    it("defaults dynamodb table_name to 'buildvalve'", () => {
      const cfg = baseConfig();
      cfg.storage = { type: "dynamodb", region: "us-east-1" };
      expect(resolveStorage(cfg).tableName).toBe("buildvalve");
    });

    it("honors sqlite_path for EFS/NFS overrides", () => {
      const cfg = baseConfig();
      cfg.storage = { type: "sqlite", sqlite_path: "/mnt/efs/buildvalve" };
      expect(resolveStorage(cfg).sqlitePath).toBe("/mnt/efs/buildvalve");
    });
  });
});
