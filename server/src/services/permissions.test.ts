import { describe, it, expect } from "vitest";
import { getAllowedProjectIds, getAllowedProjects, isAuthorized, isPipelineAuthorized } from "./permissions.js";
import type { AppConfig, AuthUser, PipelineConfig } from "../types/index.js";

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    ci_providers: [{ name: "default", type: "gitlab", url: "https://gitlab.example.com", token: "tok" }],
    auth: { providers: [] },
    session: { secret: "testsecret", max_age: 3600 },
    projects: [
      { id: "1", name: "Project A", provider: "default", external_id: "1", pipelines: [] },
      { id: "2", name: "Project B", provider: "default", external_id: "2", pipelines: [] },
      { id: "3", name: "Project C", provider: "default", external_id: "3", pipelines: [] },
    ],
    permissions: [],
    ...overrides,
  };
}

function makeUser(overrides: Partial<AuthUser> = {}): AuthUser {
  return {
    email: "alice@example.com",
    provider: "mock",
    ...overrides,
  };
}

describe("getAllowedProjectIds", () => {
  it("returns empty set when no permissions match", () => {
    const config = makeConfig({
      permissions: [{ users: ["bob@example.com"], projects: ["1"] }],
    });
    const result = getAllowedProjectIds(makeUser(), config);
    expect(result.size).toBe(0);
  });

  it("matches by email", () => {
    const config = makeConfig({
      permissions: [{ users: ["alice@example.com"], projects: ["1", "2"] }],
    });
    const result = getAllowedProjectIds(makeUser(), config);
    expect(result).toEqual(new Set(["1", "2"]));
  });

  it("matches by group", () => {
    const config = makeConfig({
      permissions: [{ groups: ["devops"], projects: ["3"] }],
    });
    const user = makeUser({ groups: ["devops", "eng"] });
    const result = getAllowedProjectIds(user, config);
    expect(result).toEqual(new Set(["3"]));
  });

  it("combines projects from multiple matching rules", () => {
    const config = makeConfig({
      permissions: [
        { users: ["alice@example.com"], projects: ["1"] },
        { groups: ["eng"], projects: ["2", "3"] },
      ],
    });
    const user = makeUser({ groups: ["eng"] });
    const result = getAllowedProjectIds(user, config);
    expect(result).toEqual(new Set(["1", "2", "3"]));
  });

  it("does not match groups when user has no groups", () => {
    const config = makeConfig({
      permissions: [{ groups: ["admin"], projects: ["1"] }],
    });
    const result = getAllowedProjectIds(makeUser(), config);
    expect(result.size).toBe(0);
  });
});

describe("getAllowedProjects", () => {
  it("returns project configs for allowed IDs only", () => {
    const config = makeConfig({
      permissions: [{ users: ["alice@example.com"], projects: ["2"] }],
    });
    const result = getAllowedProjects(makeUser(), config);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Project B");
  });
});

describe("isAuthorized", () => {
  it("returns true for allowed project", () => {
    const config = makeConfig({
      permissions: [{ users: ["alice@example.com"], projects: ["1"] }],
    });
    expect(isAuthorized(makeUser(), "1", config)).toBe(true);
  });

  it("returns false for disallowed project", () => {
    const config = makeConfig({
      permissions: [{ users: ["alice@example.com"], projects: ["1"] }],
    });
    expect(isAuthorized(makeUser(), "2", config)).toBe(false);
  });
});

describe("isPipelineAuthorized", () => {
  const basePipeline: PipelineConfig = { name: "deploy", ref: "main", variables: [] };

  it("allows access when no restrictions are set", () => {
    expect(isPipelineAuthorized(makeUser(), basePipeline)).toBe(true);
  });

  it("allows access when allowed_users includes user email", () => {
    const pipeline = { ...basePipeline, allowed_users: ["alice@example.com", "bob@example.com"] };
    expect(isPipelineAuthorized(makeUser(), pipeline)).toBe(true);
  });

  it("denies access when allowed_users does not include user email", () => {
    const pipeline = { ...basePipeline, allowed_users: ["bob@example.com"] };
    expect(isPipelineAuthorized(makeUser(), pipeline)).toBe(false);
  });

  it("allows access when user is in an allowed group", () => {
    const pipeline = { ...basePipeline, allowed_groups: ["devops"] };
    const user = makeUser({ groups: ["devops", "eng"] });
    expect(isPipelineAuthorized(user, pipeline)).toBe(true);
  });

  it("denies access when user is not in any allowed group", () => {
    const pipeline = { ...basePipeline, allowed_groups: ["devops"] };
    const user = makeUser({ groups: ["eng"] });
    expect(isPipelineAuthorized(user, pipeline)).toBe(false);
  });

  it("denies access when user has no groups and only group restriction exists", () => {
    const pipeline = { ...basePipeline, allowed_groups: ["devops"] };
    expect(isPipelineAuthorized(makeUser(), pipeline)).toBe(false);
  });

  it("allows access when user matches allowed_users but not allowed_groups", () => {
    const pipeline = { ...basePipeline, allowed_users: ["alice@example.com"], allowed_groups: ["admin"] };
    expect(isPipelineAuthorized(makeUser(), pipeline)).toBe(true);
  });

  it("allows access when user matches allowed_groups but not allowed_users", () => {
    const pipeline = { ...basePipeline, allowed_users: ["bob@example.com"], allowed_groups: ["eng"] };
    const user = makeUser({ groups: ["eng"] });
    expect(isPipelineAuthorized(user, pipeline)).toBe(true);
  });

  it("treats empty arrays as no restriction", () => {
    const pipeline = { ...basePipeline, allowed_users: [], allowed_groups: [] };
    expect(isPipelineAuthorized(makeUser(), pipeline)).toBe(true);
  });
});
