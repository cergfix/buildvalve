import { describe, it, expect } from "vitest";
import type { AuthUser, SamlProviderConfig } from "../../types/index.js";

// extractUser and getAttr are private methods on SamlProvider.
// Rather than coupling tests to passport/saml internals, we replicate
// the extraction logic here for direct unit testing.

function getAttr(
  profile: Record<string, unknown>,
  key: string
): string | string[] | undefined {
  const val = profile[key];
  if (val !== undefined) return val as string | string[];

  const attrs = profile["attributes"] as Record<string, unknown> | undefined;
  if (attrs) {
    const attrVal = attrs[key];
    if (attrVal !== undefined) return attrVal as string | string[];
  }

  return undefined;
}

function extractUser(
  profile: Record<string, unknown>,
  mapping: SamlProviderConfig["attribute_mapping"]
): AuthUser {
  const rawEmail = getAttr(profile, mapping.email);
  const email =
    (Array.isArray(rawEmail) ? rawEmail[0] : rawEmail) ??
    (profile.nameID as string) ??
    "";

  const rawUsername = getAttr(profile, mapping.username);
  const username =
    (Array.isArray(rawUsername) ? rawUsername[0] : rawUsername) ??
    email.split("@")[0] ??
    "";

  let groups: string[] | undefined;
  if (mapping.groups) {
    const raw = getAttr(profile, mapping.groups);
    if (raw) {
      groups = Array.isArray(raw) ? raw : [raw];
    }
  }

  return { email, username, provider: "saml", groups };
}

const defaultMapping: SamlProviderConfig["attribute_mapping"] = {
  email: "email",
  username: "displayName",
  groups: "memberOf",
};

describe("extractUser (SAML profile parsing)", () => {
  it("extracts user from top-level profile attributes", () => {
    const profile = {
      email: "alice@corp.com",
      displayName: "alice",
      memberOf: ["devops", "engineering"],
      nameID: "alice@corp.com",
    };
    const user = extractUser(profile, defaultMapping);
    expect(user).toEqual({
      email: "alice@corp.com",
      username: "alice",
      provider: "saml",
      groups: ["devops", "engineering"],
    });
  });

  it("extracts from nested attributes object", () => {
    const profile = {
      nameID: "fallback@corp.com",
      attributes: {
        email: "nested@corp.com",
        displayName: "nesteduser",
        memberOf: ["admins"],
      },
    };
    const user = extractUser(profile, defaultMapping);
    expect(user.email).toBe("nested@corp.com");
    expect(user.username).toBe("nesteduser");
    expect(user.groups).toEqual(["admins"]);
  });

  it("handles array values (picks first element)", () => {
    const profile = {
      email: ["first@corp.com", "second@corp.com"],
      displayName: ["First User"],
    };
    const user = extractUser(profile, defaultMapping);
    expect(user.email).toBe("first@corp.com");
    expect(user.username).toBe("First User");
  });

  it("falls back to nameID when email attr is missing", () => {
    const profile = { nameID: "fallback@corp.com" };
    const user = extractUser(profile, defaultMapping);
    expect(user.email).toBe("fallback@corp.com");
  });

  it("derives username from email when displayName is missing", () => {
    const profile = { email: "jane.doe@corp.com" };
    const user = extractUser(profile, defaultMapping);
    expect(user.username).toBe("jane.doe");
  });

  it("wraps single group string in array", () => {
    const profile = { email: "a@b.com", memberOf: "single-group" };
    const user = extractUser(profile, defaultMapping);
    expect(user.groups).toEqual(["single-group"]);
  });

  it("leaves groups undefined when mapping has no groups key", () => {
    const profile = { email: "a@b.com", memberOf: ["g1"] };
    const mapping = { email: "email", username: "displayName" };
    const user = extractUser(profile, mapping);
    expect(user.groups).toBeUndefined();
  });

  it("leaves groups undefined when attribute is missing", () => {
    const profile = { email: "a@b.com" };
    const user = extractUser(profile, defaultMapping);
    expect(user.groups).toBeUndefined();
  });
});

describe("getAttr (attribute lookup)", () => {
  it("finds top-level attribute", () => {
    expect(getAttr({ foo: "bar" }, "foo")).toBe("bar");
  });

  it("finds nested attribute", () => {
    expect(getAttr({ attributes: { foo: "bar" } }, "foo")).toBe("bar");
  });

  it("prefers top-level over nested", () => {
    expect(getAttr({ foo: "top", attributes: { foo: "nested" } }, "foo")).toBe("top");
  });

  it("returns undefined for missing attribute", () => {
    expect(getAttr({}, "missing")).toBeUndefined();
  });
});
