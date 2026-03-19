import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import Ajv, { type ErrorObject } from "ajv";
import type { AppConfig } from "./types/index.js";

const ciProviderSchema = {
  type: "object",
  required: ["name", "type"],
  properties: {
    name: { type: "string" },
    type: { type: "string", enum: ["gitlab", "github-actions", "circleci"] },
    mock: { type: "boolean" },
    url: { type: "string" },
    token: { type: "string" },
    github_token: { type: "string" },
    github_api_url: { type: "string" },
    circleci_token: { type: "string" },
    circleci_api_url: { type: "string" },
  },
};

const schema = {
  type: "object",
  required: ["auth", "session", "projects", "permissions"],
  properties: {
    admins: { type: "array", items: { type: "string" } },

    // New multi-provider config
    ci_providers: {
      type: "array",
      items: ciProviderSchema,
    },

    // Legacy single-gitlab config (auto-migrated)
    gitlab: {
      type: "object",
      required: ["url", "service_account_token"],
      properties: {
        url: { type: "string" },
        service_account_token: { type: "string" },
        mock: { type: "boolean" },
      },
    },

    auth: {
      type: "object",
      required: ["providers"],
      properties: {
        providers: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["type", "enabled", "label"],
            properties: {
              type: { type: "string", enum: ["saml", "github", "google", "gitlab", "local", "mock"] },
              enabled: { type: "boolean" },
              label: { type: "string" },

              client_id: { type: "string" },
              client_secret: { type: "string" },
              callback_url: { type: "string" },
              scopes: { type: "string" },
              base_url: { type: "string" },
              users: {
                type: "array",
                items: {
                  type: "object",
                  required: ["email"],
                  properties: {
                    email: { type: "string" },
                    password: { type: "string" },
                    password_hash: { type: "string" },
                    groups: { type: "array", items: { type: "string" } },
                  },
                },
              },
              mock_user: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  groups: { type: "array", items: { type: "string"} }
                }
              }
            },
          },
        },
      },
    },
    session: {
      type: "object",
      required: ["secret", "max_age"],
      properties: {
        secret: { type: "string", minLength: 8 },
        max_age: { type: "number", minimum: 60 },
        store: { type: "string", enum: ["sqlite", "redis"] },
        redis_url: { type: "string" },
      },
    },
    projects: {
      type: "array",
      items: {
        type: "object",
        required: ["id", "name", "pipelines"],
        properties: {
          id: { type: ["string", "number"] },
          name: { type: "string" },
          description: { type: "string" },
          provider: { type: "string" },
          external_id: { type: ["string", "number"] },
          pipelines: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "ref"],
              properties: {
                name: { type: "string" },
                ref: { type: "string" },
                workflow_id: { type: "string" },
                allowed_users: { type: "array", items: { type: "string" } },
                allowed_groups: { type: "array", items: { type: "string" } },
                variables: {
                  type: "array",
                  items: {
                    type: "object",
                    required: ["key", "value", "locked"],
                    properties: {
                      key: { type: "string" },
                      value: { type: "string" },
                      locked: { type: "boolean" },
                      required: { type: "boolean" },
                      description: { type: "string" },
                      type: { type: "string", enum: ["text", "select", "radio"] },
                      options: { type: "array", items: { type: "string" } },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    permissions: {
      type: "array",
      items: {
        type: "object",
        required: ["projects"],
        properties: {
          users: { type: "array", items: { type: "string" } },
          groups: { type: "array", items: { type: "string" } },
          projects: { type: "array", items: { type: ["string", "number"] } },
        },
      },
    },
    external_links: {
      type: "array",
      items: {
        type: "object",
        required: ["label", "url"],
        properties: {
          label: { type: "string" },
          url: { type: "string" },
        },
      },
    },
  },
};

export function loadConfig(configPath?: string): AppConfig {
  const path = configPath ?? "/app/config/config.yml";

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(`Cannot read config file at ${path}: ${(err as Error).message}`);
  }

  const parsed = yaml.load(raw) as Record<string, unknown>;

  const ajv = new Ajv.default({ allErrors: true, allowUnionTypes: true });
  const validate = ajv.compile(schema);

  if (!validate(parsed)) {
    const errors = validate.errors
      ?.map((e: ErrorObject) => `  ${e.instancePath || "/"}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid config:\n${errors}`);
  }

  // Migrate legacy gitlab config to ci_providers
  migrateConfig(parsed);

  // Validate provider references
  const config = parsed as unknown as AppConfig;
  const providerNames = new Set(config.ci_providers.map((p) => p.name));
  for (const project of config.projects) {
    if (!providerNames.has(project.provider)) {
      throw new Error(
        `Project "${project.name}" references unknown CI provider "${project.provider}". ` +
        `Available providers: ${[...providerNames].join(", ")}`
      );
    }
  }

  return config;
}

function migrateConfig(parsed: Record<string, unknown>): void {
  // Ensure ci_providers exists
  if (!parsed.ci_providers) {
    parsed.ci_providers = [];
  }

  // Migrate legacy gitlab block to a ci_providers entry
  const legacy = parsed.gitlab as { url: string; service_account_token: string; mock?: boolean } | undefined;
  if (legacy) {
    const providers = parsed.ci_providers as Array<Record<string, unknown>>;
    // Only add if no provider named "default" exists already
    if (!providers.some((p) => p.name === "default")) {
      providers.push({
        name: "default",
        type: "gitlab",
        url: legacy.url,
        token: legacy.service_account_token,
        mock: legacy.mock,
      });
    }
  }

  // Normalize projects: ensure string IDs, provider, and external_id
  const projects = parsed.projects as Array<Record<string, unknown>>;
  for (const project of projects) {
    // Convert numeric id to string
    project.id = String(project.id);

    // Default provider to "default" if not set
    if (!project.provider) {
      project.provider = "default";
    }

    // Default external_id to id if not set
    if (!project.external_id) {
      project.external_id = project.id;
    } else {
      project.external_id = String(project.external_id);
    }
  }

  // Normalize permissions: convert numeric project IDs to strings
  const permissions = parsed.permissions as Array<{ projects: (string | number)[] }>;
  for (const rule of permissions) {
    rule.projects = rule.projects.map((p) => String(p));
  }
}
