import { describe, it, expect } from "vitest";
import {
  getAllowedProjectIds,
  getAllowedProjects,
  isAuthorized,
  isPipelineAuthorized,
  emailMatchesPattern,
  isAdminEmail,
  hasLoginAccess,
} from "./permissions.js";
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

describe("emailMatchesPattern (wildcards)", () => {
  it("matches exact email (case-insensitive)", () => {
    expect(emailMatchesPattern("alice@co.com", "alice@co.com")).toBe(true);
    expect(emailMatchesPattern("ALICE@co.com", "alice@co.com")).toBe(true);
    expect(emailMatchesPattern("alice@co.com", "bob@co.com")).toBe(false);
  });

  it("matches any email on a domain when pattern starts with *@", () => {
    expect(emailMatchesPattern("*@example.com", "alice@example.com")).toBe(true);
    expect(emailMatchesPattern("*@example.com", "bob@example.com")).toBe(true);
    expect(emailMatchesPattern("*@example.com", "alice@EXAMPLE.COM")).toBe(true);
    expect(emailMatchesPattern("*@example.com", "alice@other.com")).toBe(false);
    // Must not silently match unrelated emails containing the substring.
    expect(emailMatchesPattern("*@example.com", "alice@example.com.attacker.net")).toBe(false);
  });

  it("matches everything when pattern is '*'", () => {
    expect(emailMatchesPattern("*", "alice@co.com")).toBe(true);
    expect(emailMatchesPattern("*", "anyone@anywhere.local")).toBe(true);
  });

  it("does not interpret other wildcard forms (intentional minimalism)", () => {
    // We don't pretend to support sub-domain or prefix globs — anything other
    // than the three documented forms must fall through to exact-match and
    // therefore not match a real email.
    expect(emailMatchesPattern("alice@*", "alice@co.com")).toBe(false);
    expect(emailMatchesPattern("*alice*", "alice@co.com")).toBe(false);
  });
});

describe("getAllowedProjectIds with wildcards", () => {
  it("grants access to every user via users: ['*'] catch-all rule", () => {
    const config = makeConfig({
      permissions: [{ users: ["*"], projects: ["1", "2"] }],
    });
    expect([...getAllowedProjectIds(makeUser({ email: "random@anywhere.com" }), config)].sort())
      .toEqual(["1", "2"]);
  });

  it("grants access to a whole domain via *@domain.com", () => {
    const config = makeConfig({
      permissions: [
        { users: ["admin@co.com"], projects: ["1"] },
        { users: ["*@example.com"], projects: ["2", "3"] },
      ],
    });
    expect([...getAllowedProjectIds(makeUser({ email: "sergei@example.com" }), config)].sort())
      .toEqual(["2", "3"]);
    expect([...getAllowedProjectIds(makeUser({ email: "admin@co.com" }), config)].sort())
      .toEqual(["1"]);
    expect([...getAllowedProjectIds(makeUser({ email: "stranger@gmail.com" }), config)].sort())
      .toEqual([]);
  });

  it("unions exact-email and domain-wildcard rules for the same user", () => {
    const config = makeConfig({
      permissions: [
        { users: ["alice@co.com"], projects: ["1"] },
        { users: ["*@co.com"], projects: ["2"] },
      ],
    });
    expect([...getAllowedProjectIds(makeUser({ email: "alice@co.com" }), config)].sort())
      .toEqual(["1", "2"]);
  });
});

describe("isPipelineAuthorized with wildcards", () => {
  it("honors *@domain.com in allowed_users", () => {
    const pipeline: PipelineConfig = {
      name: "deploy", ref: "main", variables: [],
      allowed_users: ["*@example.com"],
    };
    expect(isPipelineAuthorized(makeUser({ email: "sergei@example.com" }), pipeline)).toBe(true);
    expect(isPipelineAuthorized(makeUser({ email: "bob@other.com" }), pipeline)).toBe(false);
  });
});

describe("isAdminEmail", () => {
  it("matches exact entries in admins:", () => {
    const config = makeConfig({ admins: ["sergei@example.com"] });
    expect(isAdminEmail("sergei@example.com", config)).toBe(true);
    expect(isAdminEmail("other@example.com", config)).toBe(false);
  });

  it("honors *@domain.com and * wildcards in admins:", () => {
    const config = makeConfig({ admins: ["*@example.com"] });
    expect(isAdminEmail("anyone@example.com", config)).toBe(true);
    expect(isAdminEmail("anyone@other.com", config)).toBe(false);

    const open = makeConfig({ admins: ["*"] });
    expect(isAdminEmail("anyone@anywhere.local", open)).toBe(true);
  });

  it("returns false when admins is absent or email is missing", () => {
    expect(isAdminEmail("a@b.com", makeConfig({}))).toBe(false);
    expect(isAdminEmail(undefined, makeConfig({ admins: ["*"] }))).toBe(false);
  });
});

describe("hasLoginAccess", () => {
  it("matches exact emails", () => {
    const config = makeConfig({ permissions: [{ users: ["alice@co.com"], projects: ["1"] }] });
    expect(hasLoginAccess(makeUser({ email: "alice@co.com" }), config)).toBe(true);
    expect(hasLoginAccess(makeUser({ email: "bob@co.com" }), config)).toBe(false);
  });

  it("honors *@domain.com wildcard", () => {
    const config = makeConfig({ permissions: [{ users: ["*@example.com"], projects: ["1"] }] });
    expect(hasLoginAccess(makeUser({ email: "sergei@example.com" }), config)).toBe(true);
    expect(hasLoginAccess(makeUser({ email: "outsider@other.com" }), config)).toBe(false);
  });

  it("honors * catch-all", () => {
    const config = makeConfig({ permissions: [{ users: ["*"], projects: ["1"] }] });
    expect(hasLoginAccess(makeUser({ email: "anyone@anywhere.local" }), config)).toBe(true);
  });

  it("falls back to group match when email doesn't match", () => {
    const config = makeConfig({ permissions: [{ groups: ["devops"], projects: ["1"] }] });
    expect(hasLoginAccess(makeUser({ email: "bob@co.com", groups: ["devops"] }), config)).toBe(true);
    expect(hasLoginAccess(makeUser({ email: "bob@co.com", groups: ["other"] }), config)).toBe(false);
  });

  it("returns false when no rule matches", () => {
    const config = makeConfig({ permissions: [{ users: ["alice@co.com"], projects: ["1"] }] });
    expect(hasLoginAccess(makeUser({ email: "stranger@elsewhere.com" }), config)).toBe(false);
  });
});
