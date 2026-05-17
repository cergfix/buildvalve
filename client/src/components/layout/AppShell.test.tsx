import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./AppShell";

(globalThis as unknown as Record<string, string>).__APP_VERSION__ = "0.0.0-test";

const mockUser = { email: "alice@co.com", provider: "mock" };
const mockLogout = vi.fn();
let mockAuthValue: Record<string, unknown> = {};

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockAuthValue,
}));

vi.mock("../../api/queries", () => ({
  pipelinesApi: {
    getRecent: vi.fn().mockResolvedValue([]),
  },
}));

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AppShell />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthValue = {
      user: mockUser,
      isLoading: false,
      isAdmin: false,
      externalLinks: [],
      logout: mockLogout,
    };
  });

  it("renders sidebar with pipelines and profile nav items", () => {
    renderShell();
    expect(screen.getByText("pipelines")).toBeInTheDocument();
    expect(screen.getByText("profile")).toBeInTheDocument();
  });

  it("shows admin settings when user is admin", () => {
    mockAuthValue.isAdmin = true;
    renderShell();
    expect(screen.getByText("admin settings")).toBeInTheDocument();
  });

  it("hides admin settings when user is not admin", () => {
    renderShell();
    expect(screen.queryByText("admin settings")).not.toBeInTheDocument();
  });

  it("renders external links in the sidebar", () => {
    mockAuthValue.externalLinks = [
      { label: "Grafana", url: "https://grafana.example.com" },
      { label: "Sentry", url: "https://sentry.example.com" },
    ];
    renderShell();

    const grafanaLink = screen.getByText("Grafana");
    expect(grafanaLink).toBeInTheDocument();
    expect(grafanaLink.closest("a")).toHaveAttribute("href", "https://grafana.example.com");
    expect(grafanaLink.closest("a")).toHaveAttribute("target", "_blank");
    expect(grafanaLink.closest("a")).toHaveAttribute("rel", "noopener noreferrer");

    const sentryLink = screen.getByText("Sentry");
    expect(sentryLink).toBeInTheDocument();
    expect(sentryLink.closest("a")).toHaveAttribute("href", "https://sentry.example.com");
  });

  it("does not render external links section when empty", () => {
    mockAuthValue.externalLinks = [];
    renderShell();
    expect(screen.queryByText("Grafana")).not.toBeInTheDocument();
  });

  it("renders BuildValve branding", () => {
    renderShell();
    expect(screen.getByText("BUILDVALVE")).toBeInTheDocument();
  });

  it("shows logout button", () => {
    renderShell();
    expect(screen.getByText("logout")).toBeInTheDocument();
  });

  it("redirects to /login when user is null", () => {
    mockAuthValue.user = null;
    renderShell();
    expect(screen.queryByText("pipelines")).not.toBeInTheDocument();
  });
});
