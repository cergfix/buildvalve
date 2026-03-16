import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthProvider, useAuth } from "./AuthContext";

const mockGetMe = vi.fn();
const mockLogout = vi.fn();

vi.mock("../api/queries", () => ({
  authApi: {
    getMe: () => mockGetMe(),
    logout: () => mockLogout(),
  },
}));

// Mock window.location
const locationSpy = vi.spyOn(window, "location", "get");

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locationSpy.mockReturnValue({ ...window.location, href: "/" } as Location);
  });

  it("starts in loading state", () => {
    mockGetMe.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("sets authenticated state on successful getMe", async () => {
    mockGetMe.mockResolvedValue({
      user: { email: "a@b.com", provider: "mock" },
      projects: [{ id: 1, name: "P1", pipelines: [] }],
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe("a@b.com");
    expect(result.current.projects).toHaveLength(1);
  });

  it("sets unauthenticated state when getMe fails", async () => {
    mockGetMe.mockRejectedValue(new Error("401"));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it("logout clears data and redirects", async () => {
    mockGetMe.mockResolvedValue({
      user: { email: "a@b.com", provider: "mock" },
      projects: [],
    });
    mockLogout.mockResolvedValue({ ok: true });

    const mockLocation = { ...window.location, href: "/" };
    locationSpy.mockReturnValue(mockLocation as Location);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.user).toBeNull();
  });

  it("exposes externalLinks from API response", async () => {
    mockGetMe.mockResolvedValue({
      user: { email: "a@b.com", provider: "mock" },
      projects: [],
      isAdmin: false,
      externalLinks: [
        { label: "Grafana", url: "https://grafana.example.com" },
        { label: "Wiki", url: "https://wiki.example.com" },
      ],
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.externalLinks).toHaveLength(2);
    expect(result.current.externalLinks[0]).toEqual({
      label: "Grafana",
      url: "https://grafana.example.com",
    });
  });

  it("defaults externalLinks to empty array when not in response", async () => {
    mockGetMe.mockResolvedValue({
      user: { email: "a@b.com", provider: "mock" },
      projects: [],
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.externalLinks).toEqual([]);
  });

  it("exposes isAdmin from API response", async () => {
    mockGetMe.mockResolvedValue({
      user: { email: "a@b.com", provider: "mock" },
      projects: [],
      isAdmin: true,
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAdmin).toBe(true);
  });

  it("throws when useAuth is used outside AuthProvider", () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within an AuthProvider");
  });
});
