import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { LoginPage } from "./LoginPage";

// Declare the global that Vite injects
declare const globalThis: { __APP_VERSION__: string };
(globalThis as any).__APP_VERSION__ = "0.0.0-test";

// Mock AuthContext
const mockCheckAuth = vi.fn();
vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isLoading: false,
    checkAuth: mockCheckAuth,
  }),
}));

// Mock API modules
const mockGetProviders = vi.fn();
const mockFetchApi = vi.fn();

vi.mock("../api/queries", () => ({
  authApi: {
    getProviders: () => mockGetProviders(),
  },
}));

vi.mock("../api/client", () => ({
  fetchApi: (...args: unknown[]) => mockFetchApi(...args),
  ApiError: class ApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  },
}));

function renderPage(route = "/login") {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProviders.mockResolvedValue([]);
  });

  it("shows branding", async () => {
    renderPage();
    expect(screen.getByText("BuildValve")).toBeInTheDocument();
    expect(screen.getByText("Sign in to launch pipelines")).toBeInTheDocument();
  });

  it("shows 'no providers' message when none configured", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/No auth providers enabled/)).toBeInTheDocument();
    });
  });

  it("renders OAuth provider buttons", async () => {
    mockGetProviders.mockResolvedValue([
      { type: "github", label: "GitHub", buttonLabel: "Sign in with GitHub", loginUrl: "/api/auth/github/login" },
      { type: "google", label: "Google", buttonLabel: "Sign in with Google", loginUrl: "/api/auth/google/login" },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Sign in with GitHub")).toBeInTheDocument();
      expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
    });
  });

  it("renders local login form for credential providers", async () => {
    mockGetProviders.mockResolvedValue([
      { type: "local", label: "Local Login", buttonLabel: "Sign in with Local Login", loginUrl: "/api/auth/local/login", form: "credentials" },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Password")).toBeInTheDocument();
      expect(screen.getByText("Sign in")).toBeInTheDocument();
    });
  });

  it("shows separator when both form and OAuth providers exist", async () => {
    mockGetProviders.mockResolvedValue([
      { type: "local", label: "Local", buttonLabel: "Sign in with Local", loginUrl: "/api/auth/local/login", form: "credentials" },
      { type: "github", label: "GitHub", buttonLabel: "Sign in with GitHub", loginUrl: "/api/auth/github/login" },
    ]);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("or")).toBeInTheDocument();
    });
  });

  it("submits local login form and calls checkAuth on success", async () => {
    const user = userEvent.setup();
    mockGetProviders.mockResolvedValue([
      { type: "local", label: "Local Login", buttonLabel: "Sign in", loginUrl: "/api/auth/local/login", form: "credentials" },
    ]);
    mockFetchApi.mockResolvedValue({ ok: true });
    mockCheckAuth.mockResolvedValue(undefined);

    renderPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Email"), "alice@co.com");
    await user.type(screen.getByPlaceholderText("Password"), "secret123");
    await user.click(screen.getByText("Sign in"));

    await waitFor(() => {
      expect(mockFetchApi).toHaveBeenCalledWith("/api/auth/local/login", {
        method: "POST",
        body: JSON.stringify({ email: "alice@co.com", password: "secret123" }),
      });
      expect(mockCheckAuth).toHaveBeenCalled();
    });
  });

  it("shows error when local login fails", async () => {
    const user = userEvent.setup();
    mockGetProviders.mockResolvedValue([
      { type: "local", label: "Local Login", buttonLabel: "Sign in", loginUrl: "/api/auth/local/login", form: "credentials" },
    ]);
    mockFetchApi.mockRejectedValue(new Error("Invalid email or password"));

    renderPage();

    await waitFor(() => {
      expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    });

    await user.type(screen.getByPlaceholderText("Email"), "alice@co.com");
    await user.type(screen.getByPlaceholderText("Password"), "wrong");
    await user.click(screen.getByText("Sign in"));

    await waitFor(() => {
      expect(screen.getByText("Invalid email or password")).toBeInTheDocument();
    });
  });

  describe("URL error messages", () => {
    it("shows access_denied error", async () => {
      renderPage("/login?error=access_denied");
      await waitFor(() => {
        expect(screen.getByText(/Access denied/)).toBeInTheDocument();
      });
    });

    it("shows oauth_denied error", async () => {
      renderPage("/login?error=oauth_denied");
      await waitFor(() => {
        expect(screen.getByText(/cancelled or denied/)).toBeInTheDocument();
      });
    });

    it("shows session_error", async () => {
      renderPage("/login?error=session_error");
      await waitFor(() => {
        expect(screen.getByText(/session error/)).toBeInTheDocument();
      });
    });

    it("shows oauth_error", async () => {
      renderPage("/login?error=oauth_error");
      await waitFor(() => {
        expect(screen.getByText(/error occurred during authentication/)).toBeInTheDocument();
      });
    });

    it("shows saml_error", async () => {
      renderPage("/login?error=saml_error");
      await waitFor(() => {
        expect(screen.getByText(/SAML authentication failed/)).toBeInTheDocument();
      });
    });

    it("shows no_user error", async () => {
      renderPage("/login?error=no_user");
      await waitFor(() => {
        expect(screen.getByText(/No user profile/)).toBeInTheDocument();
      });
    });

    it("shows generic error for unknown codes", async () => {
      renderPage("/login?error=something_else");
      await waitFor(() => {
        expect(screen.getByText(/Authentication error: something_else/)).toBeInTheDocument();
      });
    });
  });

  it("shows fetch error when providers API fails", async () => {
    mockGetProviders.mockRejectedValue(new Error("Network error"));

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/Unable to load authentication providers/)).toBeInTheDocument();
    });
  });
});
