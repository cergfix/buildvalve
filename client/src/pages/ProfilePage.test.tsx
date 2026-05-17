import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders, makeAuthValue, type MockAuthValue } from "../test-utils";
import { ProfilePage } from "./ProfilePage";

(globalThis as unknown as Record<string, string>).__APP_VERSION__ = "0.0.0-test";

let mockAuth: MockAuthValue;

vi.mock("../contexts/AuthContext", () => ({ useAuth: () => mockAuth }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return { ...actual, useNavigate: () => vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ProfilePage", () => {
  it("renders email, provider chip and group chips", () => {
    mockAuth = makeAuthValue({
      user: { email: "alice@co.com", provider: "saml", groups: ["devops", "admins"] },
    });
    renderWithProviders(<ProfilePage />);
    expect(screen.getByText("alice@co.com")).toBeInTheDocument();
    expect(screen.getByText("SAML")).toBeInTheDocument();
    expect(screen.getByText("devops")).toBeInTheDocument();
    expect(screen.getByText("admins")).toBeInTheDocument();
  });

  it("renders 'no groups' notice when groups is empty", () => {
    mockAuth = makeAuthValue({
      user: { email: "alice@co.com", provider: "local", groups: [] },
    });
    renderWithProviders(<ProfilePage />);
    expect(screen.getByText(/no groups available/i)).toBeInTheDocument();
  });

  it("returns null when no user is signed in", () => {
    mockAuth = makeAuthValue({ user: null });
    const { container } = renderWithProviders(<ProfilePage />);
    expect(container.firstChild).toBeNull();
  });
});
