import { describe, it, expect, beforeEach } from "vitest";

// The registry uses module-level state, so we need to re-import fresh each test.
// We use dynamic imports with vitest's module reset.

describe("auth provider registry", () => {
  beforeEach(async () => {
    // Reset the module so the internal Map is cleared
    const { vi } = await import("vitest");
    vi.resetModules();
  });

  it("registers and retrieves a provider", async () => {
    const { registerProvider, getProvider } = await import("./index.js");
    const mockProvider = { type: "mock", label: "Mock Login", setupRoutes: () => {} };
    registerProvider(mockProvider);
    expect(getProvider("mock")).toBe(mockProvider);
  });

  it("returns undefined for unregistered provider", async () => {
    const { getProvider } = await import("./index.js");
    expect(getProvider("nonexistent")).toBeUndefined();
  });

  it("getAllProviders returns all registered providers", async () => {
    const { registerProvider, getAllProviders } = await import("./index.js");
    const p1 = { type: "saml", label: "Okta", setupRoutes: () => {} };
    const p2 = { type: "mock", label: "Mock", setupRoutes: () => {} };
    registerProvider(p1);
    registerProvider(p2);
    expect(getAllProviders()).toHaveLength(2);
    expect(getAllProviders()).toEqual(expect.arrayContaining([p1, p2]));
  });

  it("overwrites provider with same type", async () => {
    const { registerProvider, getProvider, getAllProviders } = await import("./index.js");
    const p1 = { type: "mock", label: "Old", setupRoutes: () => {} };
    const p2 = { type: "mock", label: "New", setupRoutes: () => {} };
    registerProvider(p1);
    registerProvider(p2);
    expect(getProvider("mock")?.label).toBe("New");
    expect(getAllProviders()).toHaveLength(1);
  });
});
