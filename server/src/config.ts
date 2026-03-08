import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import Ajv, { type ErrorObject } from "ajv";
import type { AppConfig } from "./types/index.js";

const schema = {
  type: "object",
  required: ["gitlab", "auth", "session", "projects", "permissions"],
  properties: {
    admins: { type: "array", items: { type: "string" } },
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
              type: { type: "string", enum: ["saml", "github", "gitlab", "mock"] },
              enabled: { type: "boolean" },
              label: { type: "string" },
              mock_user: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  username: { type: "string" },
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
          id: { type: "number" },
          name: { type: "string" },
          description: { type: "string" },
          pipelines: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "ref"],
              properties: {
                name: { type: "string" },
                ref: { type: "string" },
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
          projects: { type: "array", items: { type: "number" } },
        },
      },
    },
  },
};

export function loadConfig(configPath?: string): AppConfig {
  const path = configPath ?? resolve(process.cwd(), "../config/config.yml");

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch (err) {
    throw new Error(`Cannot read config file at ${path}: ${(err as Error).message}`);
  }

  const parsed = yaml.load(raw);

  const ajv = new Ajv.default({ allErrors: true });
  const validate = ajv.compile(schema);

  if (!validate(parsed)) {
    const errors = validate.errors
      ?.map((e: ErrorObject) => `  ${e.instancePath || "/"}: ${e.message}`)
      .join("\n");
    throw new Error(`Invalid config:\n${errors}`);
  }

  return parsed as unknown as AppConfig;
}
