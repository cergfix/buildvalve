import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, makeAuthValue, type MockAuthValue } from "../test-utils";
import { RecentRunsPage } from "./RecentRunsPage";

(globalThis as unknown as Record<string, string>).__APP_VERSION__ = "0.0.0-test";

let mockAuth: MockAuthValue;
const mockGetRecent = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../contexts/AuthContext", () => ({ useAuth: () => mockAuth }));
vi.mock("../api/queries", () => ({
  pipelinesApi: { getRecent: () => mockGetRecent() },
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = makeAuthValue({
    projects: [
      {
        id: "p1",
        name: "Backend",
        provider: "gitlab",
        pipelines: [{ name: "Deploy", ref: "main", providerType: "gitlab", variables: [] }],
      },
    ],
  });
});

describe("RecentRunsPage", () => {
  it("shows the empty state when there are no runs", async () => {
    mockGetRecent.mockResolvedValue([]);
    renderWithProviders(<RecentRunsPage />);
    await waitFor(() => expect(screen.getByText(/no recent runs/i)).toBeInTheDocument());
  });

  it("flattens API rows into a list, joining pipeline names via ref+provider", async () => {
    mockGetRecent.mockResolvedValue([
      {
        projectId: "p1",
        pipelines: [
          { id: "100", status: "success", ref: "main", web_url: "x", provider: "gitlab" },
        ],
      },
    ]);

    renderWithProviders(<RecentRunsPage />);
    await waitFor(() => expect(screen.getByText("#100")).toBeInTheDocument());
    // Pipeline name was resolved from the project config by matching ref.
    expect(screen.getByText("Deploy")).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
  });

  it("navigates to the run when a row is clicked", async () => {
    const user = userEvent.setup();
    mockGetRecent.mockResolvedValue([
      {
        projectId: "p1",
        pipelines: [{ id: "100", status: "success", ref: "main", web_url: "x", provider: "gitlab" }],
      },
    ]);
    renderWithProviders(<RecentRunsPage />);
    await waitFor(() => expect(screen.getByText("#100")).toBeInTheDocument());

    await user.click(screen.getByText("#100"));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("/run/100"));
  });

  it("skips runs whose project the user can't see", async () => {
    mockGetRecent.mockResolvedValue([
      { projectId: "unknown", pipelines: [{ id: "999", status: "success", ref: "main", web_url: "x" }] },
    ]);
    renderWithProviders(<RecentRunsPage />);
    await waitFor(() => expect(screen.getByText(/no recent runs/i)).toBeInTheDocument());
  });
});
