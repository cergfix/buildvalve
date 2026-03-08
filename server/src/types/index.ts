import "express-session";

// --- Auth ---

export interface AuthUser {
  email: string;
  provider: string;
  groups?: string[];
}

export interface ExternalLink {
  label: string;
  url: string;
}

// --- CI Provider Config ---

export type CIProviderType = "gitlab" | "github-actions" | "circleci";

export interface CIProviderConfigEntry {
  name: string;
  type: CIProviderType;
  mock?: boolean;
  // GitLab
  url?: string;
  token?: string;
  // GitHub Actions
  github_token?: string;
  github_api_url?: string;
  // CircleCI
  circleci_token?: string;
  circleci_api_url?: string;
}

// --- Pipeline / Project Config ---

export interface VariableConfig {
  key: string;
  value: string;
  locked: boolean;
  description?: string;
  type?: "text" | "select" | "radio"; // default: "text"
  options?: string[]; // choices for select/radio
  /**
   * Conditional visibility. Map of other-variable-key → required value(s).
   * The variable is only shown / sent to the CI provider when ALL listed
   * conditions are satisfied (logical AND between keys, any-of for list
   * values). A missing referenced key is treated as not-satisfied.
   * Example: needs: { ENVIRONMENT: production } — show only when ENV=production.
   * Example: needs: { ENVIRONMENT: [production, staging], DRY_RUN: "false" }.
   */
  needs?: Record<string, string | string[]>;
}

export interface PipelineConfig {
  name: string;
  ref: string;
  workflow_id?: string; // GitHub Actions: workflow filename or ID
  variables: VariableConfig[];
  provider?: string; // Optional: override project-level provider
  external_id?: string; // Optional: override project-level external_id
  allowed_users?: string[];  // restrict this pipeline to specific users (within project permissions)
  allowed_groups?: string[]; // restrict this pipeline to specific groups
}

export interface ProjectConfig {
  id: string;
  name: string;
  description?: string;
  provider: string; // references ci_providers[].name
  external_id: string; // provider-specific project identifier (e.g. "42", "owner/repo", "gh/org/repo")
  pipelines: PipelineConfig[];
}

// --- Permissions ---

export interface PermissionRule {
  users?: string[];
  groups?: string[];
  projects: string[];
}

// --- Auth Provider Configs ---

export interface SamlProviderConfig {
  type: "saml";
  enabled: boolean;
  label: string;

  entry_point: string;
  issuer: string;
  callback_url: string;
  cert: string;
  attribute_mapping: {
    email: string;
    groups?: string;
  };
}

export interface OAuthProviderConfig {
  type: "github" | "google" | "gitlab";
  enabled: boolean;
  label: string;

  client_id: string;
  client_secret: string;
  callback_url?: string;
  scopes?: string;
  base_url?: string;
}

export interface LocalUserConfig {
  email: string;
  /** SHA-256 hex digest of the password. Plain-text passwords are not supported. */
  password_sha256: string;
  groups?: string[];
}

export interface LocalProviderConfig {
  type: "local";
  enabled: boolean;
  label: string;

  users?: LocalUserConfig[];
}

export interface MockProviderConfig {
  type: "mock";
  enabled: boolean;
  label: string;

  mock_user: {
    email: string;
    groups?: string[];
  };
}

export type AuthProviderConfig = SamlProviderConfig | OAuthProviderConfig | LocalProviderConfig | MockProviderConfig;

// --- App Config ---

export interface AppConfig {
  /**
   * The externally-visible URL of this BuildValve instance. Drives security
   * defaults (HSTS, CSP upgrade-insecure-requests, Secure session cookie):
   *   • `https://...` → full HTTPS mode (HSTS on, Secure cookie)
   *   • `http://...` or a bare host with no scheme → plain-HTTP mode
   *   • missing → defaults to HTTPS-aware (safe for prod deployments behind TLS)
   * Use `http://localhost:3000` for local Docker dev.
   */
  public_url?: string;
  ci_providers: CIProviderConfigEntry[];
  auth: {
    providers: AuthProviderConfig[];
  };
  /**
   * Persistent backend for sessions AND triggered-run history. Defaults to
   * SQLite at `./data/` — mount that path as a Docker volume to persist
   * across container restarts.
   *
   *   storage: { type: sqlite }                                # default — file in ./data/
   *   storage: { type: redis,    redis_url: redis://... }
   *   storage: { type: dynamodb, region: us-east-1, table_name: buildvalve }
   *   storage: { type: mysql,    mysql_url: mysql://user:pass@host:3306/buildvalve }
   *
   * DynamoDB uses one table with composite key (pk, sk):
   *   • sessions   — pk = "session#<id>",       sk = "session"
   *   • triggered  — pk = "tr#<project>#<ref>", sk = "<ts>#<run_id>"
   * Credentials follow the standard AWS provider chain (IAM role, env vars,
   * shared config). For local testing point `endpoint` at DynamoDB Local.
   *
   * MySQL is a good fit for AWS RDS / Aurora MySQL. BuildValve creates two
   * tables on startup: `bv_sessions` (managed by express-mysql-session) and
   * `bv_triggered_runs`. Append `?ssl=true` to the URL for RDS TLS, or
   * `?ssl={"rejectUnauthorized":false}` if you want to skip cert verification.
   *
   * Backward compat: if `storage` is omitted but the legacy
   * `session.store` / `session.redis_url` are set, those are used.
   */
  storage?: {
    type: "sqlite" | "redis" | "dynamodb" | "mysql";
    redis_url?: string;
    /** AWS region for `type: dynamodb`. */
    region?: string;
    /** DynamoDB table name. Default: "buildvalve". The table must exist. */
    table_name?: string;
    /** Override the DynamoDB endpoint URL (e.g. `http://localhost:8000` for DynamoDB Local). */
    endpoint?: string;
    /** MySQL connection URL: `mysql://user:pass@host:3306/db[?ssl=true]`. */
    mysql_url?: string;
    /**
     * Directory holding the SQLite DB files (`sessions.sqlite`,
     * `triggered_runs.sqlite`). Default: `./data` (inside the container,
     * which is also declared as a VOLUME). Set to an absolute EFS mount path
     * like `/mnt/efs/buildvalve` to persist on shared storage. Single-writer
     * only — for multi-instance use Redis/MySQL/DynamoDB.
     */
    sqlite_path?: string;
    /**
     * Whether this instance runs the periodic cleanup jobs (expired session
     * sweep + 90-day triggered-runs retention prune). Default: true.
     *
     * When running multiple BuildValve instances behind a load balancer
     * against a shared DB (MySQL / Redis), set this to `false` on all
     * replicas except one — that elected instance owns cleanup so the rest
     * don't race on the same DELETEs. DynamoDB uses native TTL and SQLite
     * is single-writer-only, so this flag is mostly relevant for MySQL /
     * Redis multi-instance deployments.
     */
    run_cleanup_crons?: boolean;
  };
  session: {
    secret: string;
    max_age: number;
    /** @deprecated Use top-level `storage.type` instead. */
    store?: "sqlite" | "redis";
    /** @deprecated Use top-level `storage.redis_url` instead. */
    redis_url?: string;
  };
  projects: ProjectConfig[];
  permissions: PermissionRule[];
  admins?: string[];
  external_links?: ExternalLink[];
}

// --- Session augmentation ---

declare module "express-session" {
  interface SessionData {
    user: AuthUser;
  }
}
