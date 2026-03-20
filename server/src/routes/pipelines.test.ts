import { describe, it, expect } from "vitest";

// The validateVariables and buildFinalVariables functions are not exported,
// so we test them indirectly through the route behavior. However, we can
// also extract and test the logic by importing the module and testing
// the router endpoints directly.

// For unit testing the validation logic, we replicate the functions here
// since they're module-private. Alternatively, we could refactor them out.
// For now, testing the same logic:

import type { PipelineConfig, VariableConfig } from "../types/index.js";

// Replicated from pipelines.ts for direct unit testing
function validateVariables(
  pipelineConfig: PipelineConfig,
  userVars: Record<string, string>
): string | null {
  for (const varConfig of pipelineConfig.variables) {
    if (varConfig.locked && varConfig.key in userVars && userVars[varConfig.key] !== varConfig.value) {
      return `Variable "${varConfig.key}" is locked and cannot be changed`;
    }
    if (varConfig.required && !varConfig.locked) {
      const value = userVars[varConfig.key] ?? varConfig.value;
      if (!value) {
        return `Variable "${varConfig.key}" is required`;
      }
    }
    if (varConfig.options && varConfig.options.length > 0 && !varConfig.locked) {
      const value = userVars[varConfig.key] ?? varConfig.value;
      if (value && !varConfig.options.includes(value)) {
        return `Variable "${varConfig.key}" must be one of: ${varConfig.options.join(", ")}`;
      }
    }
  }
  const knownKeys = new Set(pipelineConfig.variables.map((v) => v.key));
  for (const key of Object.keys(userVars)) {
    if (!knownKeys.has(key)) {
      return `Unknown variable "${key}"`;
    }
  }
  return null;
}

function buildFinalVariables(
  varConfigs: VariableConfig[],
  userVars: Record<string, string>
): { key: string; value: string }[] {
  return varConfigs.map((vc) => ({
    key: vc.key,
    value: vc.locked ? vc.value : (userVars[vc.key] ?? vc.value),
  }));
}

const basePipeline: PipelineConfig = {
  name: "deploy",
  ref: "main",
  variables: [
    { key: "ENV", value: "staging", locked: false },
    { key: "TOKEN", value: "secret-123", locked: true },
    { key: "REGION", value: "", locked: false, required: true },
  ],
};

describe("validateVariables", () => {
  it("returns null for valid variables", () => {
    expect(validateVariables(basePipeline, { ENV: "prod", REGION: "us-east-1" })).toBeNull();
  });

  it("rejects locked variable override", () => {
    const result = validateVariables(basePipeline, { TOKEN: "hacked" });
    expect(result).toBe('Variable "TOKEN" is locked and cannot be changed');
  });

  it("allows sending locked variable with same value", () => {
    expect(validateVariables(basePipeline, { TOKEN: "secret-123", REGION: "eu" })).toBeNull();
  });

  it("rejects missing required variable", () => {
    const result = validateVariables(basePipeline, {});
    expect(result).toBe('Variable "REGION" is required');
  });

  it("rejects unknown variables", () => {
    const result = validateVariables(basePipeline, { REGION: "us", BOGUS: "val" });
    expect(result).toBe('Unknown variable "BOGUS"');
  });

  it("returns null for pipeline with no variables", () => {
    const pipeline: PipelineConfig = { name: "test", ref: "main", variables: [] };
    expect(validateVariables(pipeline, {})).toBeNull();
  });

  it("accepts valid select option", () => {
    const pipeline: PipelineConfig = {
      name: "test", ref: "main",
      variables: [{ key: "REGION", value: "us-east-1", locked: false, type: "select", options: ["us-east-1", "eu-west-1"] }],
    };
    expect(validateVariables(pipeline, { REGION: "eu-west-1" })).toBeNull();
  });

  it("rejects invalid select option", () => {
    const pipeline: PipelineConfig = {
      name: "test", ref: "main",
      variables: [{ key: "REGION", value: "us-east-1", locked: false, type: "select", options: ["us-east-1", "eu-west-1"] }],
    };
    const result = validateVariables(pipeline, { REGION: "ap-south-1" });
    expect(result).toBe('Variable "REGION" must be one of: us-east-1, eu-west-1');
  });

  it("accepts valid radio option", () => {
    const pipeline: PipelineConfig = {
      name: "test", ref: "main",
      variables: [{ key: "DRY_RUN", value: "true", locked: false, type: "radio", options: ["true", "false"] }],
    };
    expect(validateVariables(pipeline, { DRY_RUN: "false" })).toBeNull();
  });

  it("rejects invalid radio option", () => {
    const pipeline: PipelineConfig = {
      name: "test", ref: "main",
      variables: [{ key: "DRY_RUN", value: "true", locked: false, type: "radio", options: ["true", "false"] }],
    };
    const result = validateVariables(pipeline, { DRY_RUN: "maybe" });
    expect(result).toBe('Variable "DRY_RUN" must be one of: true, false');
  });

  it("accepts default value for select when user provides nothing", () => {
    const pipeline: PipelineConfig = {
      name: "test", ref: "main",
      variables: [{ key: "REGION", value: "us-east-1", locked: false, type: "select", options: ["us-east-1", "eu-west-1"] }],
    };
    expect(validateVariables(pipeline, {})).toBeNull();
  });

  it("skips options validation for locked variables", () => {
    const pipeline: PipelineConfig = {
      name: "test", ref: "main",
      variables: [{ key: "REGION", value: "custom-region", locked: true, type: "select", options: ["us-east-1", "eu-west-1"] }],
    };
    expect(validateVariables(pipeline, {})).toBeNull();
  });
});

describe("buildFinalVariables", () => {
  it("uses config defaults when user provides nothing", () => {
    const result = buildFinalVariables(basePipeline.variables, {});
    expect(result).toEqual([
      { key: "ENV", value: "staging" },
      { key: "TOKEN", value: "secret-123" },
      { key: "REGION", value: "" },
    ]);
  });

  it("uses user values for unlocked variables", () => {
    const result = buildFinalVariables(basePipeline.variables, { ENV: "prod", REGION: "us-west-2" });
    expect(result).toEqual([
      { key: "ENV", value: "prod" },
      { key: "TOKEN", value: "secret-123" },
      { key: "REGION", value: "us-west-2" },
    ]);
  });

  it("ignores user override for locked variables", () => {
    const result = buildFinalVariables(basePipeline.variables, { TOKEN: "override-attempt" });
    expect(result.find((v) => v.key === "TOKEN")?.value).toBe("secret-123");
  });
});
