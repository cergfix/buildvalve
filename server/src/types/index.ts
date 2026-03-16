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

// --- Config ---

export interface VariableConfig {
  key: string;
  value: string;
  locked: boolean;
  required?: boolean;
  description?: string;
}

export interface PipelineConfig {
  name: string;
  ref: string;
  variables: VariableConfig[];
}

export interface ProjectConfig {
  id: number;
  name: string;
  description?: string;
  pipelines: PipelineConfig[];
}

export interface PermissionRule {
  users?: string[];
  groups?: string[];
  projects: number[];
}

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
  base_url?: string; // GitLab self-hosted URL (defaults to https://gitlab.com)
}

export interface LocalUserConfig {
  email: string;
  password?: string;
  password_hash?: string; // sha256 hex digest
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

export interface AppConfig {
  gitlab: {
    url: string;
    service_account_token: string;
    mock?: boolean;
  };
  auth: {
    providers: AuthProviderConfig[];
  };
  session: {
    secret: string;
    max_age: number;
    store?: "sqlite" | "redis";
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

// --- GitLab API responses ---

export interface GitLabPipeline {
  id: number;
  iid: number;
  project_id: number;
  status: string;
  ref: string;
  sha: string;
  created_at: string;
  updated_at: string;
  web_url: string;
  source: string;
}

export interface GitLabJob {
  id: number;
  name: string;
  stage: string;
  status: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  duration: number | null;
  web_url: string;
}
