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
  required?: boolean;
  description?: string;
}

export interface PipelineConfig {
  name: string;
  ref: string;
  workflow_id?: string; // GitHub Actions: workflow filename or ID
  variables: VariableConfig[];
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
  password?: string;
  password_hash?: string;
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
  ci_providers: CIProviderConfigEntry[];
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

  /** @deprecated Use ci_providers instead. Kept for backward compatibility migration. */
  gitlab?: {
    url: string;
    service_account_token: string;
    mock?: boolean;
  };
}

// --- Session augmentation ---

declare module "express-session" {
  interface SessionData {
    user: AuthUser;
  }
}
