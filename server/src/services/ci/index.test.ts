import { describe, it, expect, beforeEach } from "vitest";
import { registerCIProvider, getCIProvider, getAllCIProviders, clearCIProviders } from "./index.js";
import { MockCIProvider } from "./mock-provider.js";

describe("CI Provider Registry", () => {
  beforeEach(() => {
    clearCIProviders();
  });

  it("registers and retrieves a provider by name", () => {
    const provider = new MockCIProvider("gitlab-corp", "gitlab");
    registerCIProvider(provider);

    const found = getCIProvider("gitlab-corp");
    expect(found).toBe(provider);
    expect(found?.type).toBe("gitlab");
    expect(found?.name).toBe("gitlab-corp");
  });

  it("returns undefined for unknown provider", () => {
    expect(getCIProvider("nonexistent")).toBeUndefined();
  });

  it("lists all registered providers", () => {
    registerCIProvider(new MockCIProvider("a", "gitlab"));
    registerCIProvider(new MockCIProvider("b", "github-actions"));
    registerCIProvider(new MockCIProvider("c", "circleci"));

    const all = getAllCIProviders();
    expect(all).toHaveLength(3);
    expect(all.map((p) => p.name).sort()).toEqual(["a", "b", "c"]);
  });

  it("overwrites provider with same name", () => {
    registerCIProvider(new MockCIProvider("default", "gitlab"));
    registerCIProvider(new MockCIProvider("default", "github-actions"));

    const all = getAllCIProviders();
    expect(all).toHaveLength(1);
    expect(all[0].type).toBe("github-actions");
  });

  it("clearCIProviders empties the registry", () => {
    registerCIProvider(new MockCIProvider("a", "gitlab"));
    registerCIProvider(new MockCIProvider("b", "circleci"));
    expect(getAllCIProviders()).toHaveLength(2);

    clearCIProviders();
    expect(getAllCIProviders()).toHaveLength(0);
  });
});
