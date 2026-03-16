import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppShell } from "./AppShell";

(globalThis as unknown as Record<string, string>).__APP_VERSION__ = "0.0.0-test";

const mockUser = { email: "alice@co.com", provider: "mock" };
const mockLogout = vi.fn();
let mockAuthValue: Record<string, unknown> = {};

vi.mock("../../contexts/AuthContext", () => ({
  useAuth: () => mockAuthValue,
}));

function renderShell() {
  return render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>,
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

  it("renders sidebar with Pipelines and Profile nav items", () => {
    renderShell();
    expect(screen.getByText("Pipelines")).toBeInTheDocument();
    expect(screen.getByText("Profile")).toBeInTheDocument();
  });

  it("shows Admin Settings when user is admin", () => {
    mockAuthValue.isAdmin = true;
    renderShell();
    expect(screen.getByText("Admin Settings")).toBeInTheDocument();
  });

  it("hides Admin Settings when user is not admin", () => {
    renderShell();
    expect(screen.queryByText("Admin Settings")).not.toBeInTheDocument();
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
    expect(screen.getByText("BuildValve")).toBeInTheDocument();
  });

  it("shows Logout button", () => {
    renderShell();
    expect(screen.getByText("Logout")).toBeInTheDocument();
  });

  it("redirects to /login when user is null", () => {
    mockAuthValue.user = null;
    renderShell();
    // Navigate component renders nothing visible, but the pipeline text shouldn't be shown
    expect(screen.queryByText("Pipelines")).not.toBeInTheDocument();
  });
});
