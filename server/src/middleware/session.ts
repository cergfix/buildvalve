import session from "express-session";
import connectSqlite3 from "connect-sqlite3";
import { RedisStore } from "connect-redis";
import { createClient } from "redis";
import type { AppConfig } from "../types/index.js";
import { mkdirSync } from "node:fs";
import { logger } from "../utils/logger.js";

export function createSessionMiddleware(config: AppConfig) {
  let store;

  if (config.session.store === "redis") {
    if (!config.session.redis_url) throw new Error("redis_url is required when store is redis");
    const redisClient = createClient({ url: config.session.redis_url });
    redisClient.connect().catch(e => logger.error("Redis connection error", { error: e }));
    store = new RedisStore({ client: redisClient });
    logger.info("Using Redis for session store");
  } else {
    // Default to SQLite
    mkdirSync("./data", { recursive: true });
    const SQLiteStore = connectSqlite3(session);
    store = new SQLiteStore({ dir: "./data", db: "sessions.sqlite" });
    console.log("Using SQLite for session store");
  }

  return session({
    store: store as any,
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: config.session.max_age * 1000,
    },
  });
}
