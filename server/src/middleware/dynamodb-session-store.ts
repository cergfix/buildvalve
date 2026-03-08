import { Store, type SessionData } from "express-session";
import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { logger } from "../utils/logger.js";

/**
 * Express session store backed by DynamoDB. Uses the same single-table layout
 * as the triggered-runs store:
 *   pk = "session#<sid>"
 *   sk = "session"
 *   data = serialized session
 *   ttl = unix-seconds expiry (DynamoDB TTL handles cleanup)
 *
 * Credentials follow the AWS provider chain (IAM role, env vars, etc.).
 */
export class DynamoDBSessionStore extends Store {
  private client: DynamoDBDocumentClient;
  private tableName: string;

  constructor(opts: { tableName: string; region?: string; endpoint?: string }) {
    super();
    this.tableName = opts.tableName;
    const raw = new DynamoDBClient({ region: opts.region, endpoint: opts.endpoint });
    this.client = DynamoDBDocumentClient.from(raw, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  private key(sid: string) {
    return { pk: `session#${sid}`, sk: "session" };
  }

  get(sid: string, cb: (err: unknown, session?: SessionData | null) => void): void {
    this.client
      .send(new GetCommand({ TableName: this.tableName, Key: this.key(sid) }))
      .then((res) => {
        if (!res.Item) return cb(null, null);
        const now = Math.floor(Date.now() / 1000);
        if (res.Item.ttl && Number(res.Item.ttl) < now) return cb(null, null);
        cb(null, JSON.parse(res.Item.data as string) as SessionData);
      })
      .catch((err) => {
        logger.error("DynamoDBSessionStore.get failed", { error: err });
        cb(err);
      });
  }

  set(sid: string, session: SessionData, cb?: (err?: unknown) => void): void {
    const expiresMs = session.cookie?.expires
      ? new Date(session.cookie.expires).getTime()
      : Date.now() + 24 * 60 * 60 * 1000;
    const ttl = Math.floor(expiresMs / 1000);
    this.client
      .send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            ...this.key(sid),
            data: JSON.stringify(session),
            ttl,
          },
        })
      )
      .then(() => cb?.())
      .catch((err) => {
        logger.error("DynamoDBSessionStore.set failed", { error: err });
        cb?.(err);
      });
  }

  destroy(sid: string, cb?: (err?: unknown) => void): void {
    this.client
      .send(new DeleteCommand({ TableName: this.tableName, Key: this.key(sid) }))
      .then(() => cb?.())
      .catch((err) => {
        logger.error("DynamoDBSessionStore.destroy failed", { error: err });
        cb?.(err);
      });
  }

  // express-session also accepts `touch` to bump expiry on idle reads — we
  // re-implement it via a regular set so the new TTL lands.
  touch(sid: string, session: SessionData, cb?: () => void): void {
    this.set(sid, session, () => cb?.());
  }
}
