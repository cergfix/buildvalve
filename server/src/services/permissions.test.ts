import { describe, it, expect } from "vitest";
import { getAllowedProjectIds, getAllowedProjects, isAuthorized } from "./permissions.js";
import type { AppConfig, AuthUser } from "../types/index.js";

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    gitlab: { url: "https://gitlab.example.com", service_account_token: "tok" },
    auth: { providers: [] },
    session: { secret: "testsecret", max_age: 3600 },
    projects: [
      { id: 1, name: "Project A", pipelines: [] },
      { id: 2, name: "Project B", pipelines: [] },
      { id: 3, name: "Project C", pipelines: [] },
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
      permissions: [{ users: ["bob@example.com"], projects: [1] }],
    });
    const result = getAllowedProjectIds(makeUser(), config);
    expect(result.size).toBe(0);
  });

  it("matches by email", () => {
    const config = makeConfig({
      permissions: [{ users: ["alice@example.com"], projects: [1, 2] }],
    });
    const result = getAllowedProjectIds(makeUser(), config);
    expect(result).toEqual(new Set([1, 2]));
  });

  it("matches by group", () => {
    const config = makeConfig({
      permissions: [{ groups: ["devops"], projects: [3] }],
    });
    const user = makeUser({ groups: ["devops", "eng"] });
    const result = getAllowedProjectIds(user, config);
    expect(result).toEqual(new Set([3]));
  });

  it("combines projects from multiple matching rules", () => {
    const config = makeConfig({
      permissions: [
        { users: ["alice@example.com"], projects: [1] },
        { groups: ["eng"], projects: [2, 3] },
      ],
    });
    const user = makeUser({ groups: ["eng"] });
    const result = getAllowedProjectIds(user, config);
    expect(result).toEqual(new Set([1, 2, 3]));
  });

  it("does not match groups when user has no groups", () => {
    const config = makeConfig({
      permissions: [{ groups: ["admin"], projects: [1] }],
    });
    const result = getAllowedProjectIds(makeUser(), config);
    expect(result.size).toBe(0);
  });
});

describe("getAllowedProjects", () => {
  it("returns project configs for allowed IDs only", () => {
    const config = makeConfig({
      permissions: [{ users: ["alice@example.com"], projects: [2] }],
    });
    const result = getAllowedProjects(makeUser(), config);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Project B");
  });
});

describe("isAuthorized", () => {
  it("returns true for allowed project", () => {
    const config = makeConfig({
      permissions: [{ users: ["alice@example.com"], projects: [1] }],
    });
    expect(isAuthorized(makeUser(), 1, config)).toBe(true);
  });

  it("returns false for disallowed project", () => {
    const config = makeConfig({
      permissions: [{ users: ["alice@example.com"], projects: [1] }],
    });
    expect(isAuthorized(makeUser(), 2, config)).toBe(false);
  });
});
