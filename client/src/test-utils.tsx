import * as React from "react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";

/**
 * Shared test render helper. Wraps the UI under test in a fresh QueryClient
 * (retries disabled, no refetch) and a MemoryRouter so pages that use
 * react-router hooks render without a real DOM history.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options: { route?: string; queryClient?: QueryClient } & RenderOptions = {}
) {
  const { route = "/", queryClient, ...rest } = options;
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
    });

  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
      </QueryClientProvider>,
      rest
    ),
  };
}

/**
 * Shape of the auth context the tests pretend to provide. Tests typically only
 * need a subset; missing keys are fine because page code reads them defensively.
 */
export type MockAuthValue = {
  user: { email: string; provider: string; groups?: string[] } | null;
  projects: unknown[] | null;
  isAdmin: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  externalLinks: { label: string; url: string }[];
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
};

export function makeAuthValue(overrides: Partial<MockAuthValue> = {}): MockAuthValue {
  return {
    user: { email: "alice@co.com", provider: "mock" },
    projects: [],
    isAdmin: false,
    isAuthenticated: true,
    isLoading: false,
    externalLinks: [],
    logout: async () => {},
    checkAuth: async () => {},
    ...overrides,
  };
}
