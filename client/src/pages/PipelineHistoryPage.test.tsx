import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, makeAuthValue, type MockAuthValue } from "../test-utils";
import { PipelineHistoryPage } from "./PipelineHistoryPage";

(globalThis as unknown as Record<string, string>).__APP_VERSION__ = "0.0.0-test";

let mockAuth: MockAuthValue;
const mockGetHistory = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../contexts/AuthContext", () => ({ useAuth: () => mockAuth }));
vi.mock("../api/queries", () => ({
  pipelinesApi: { getHistory: (...a: unknown[]) => mockGetHistory(...a) },
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ projectId: "p1", pipelineName: "Deploy" }),
  };
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

function makeRun(id: string, status: string, duration = 30) {
  return {
    id, status, ref: "main", web_url: "x", duration, provider: "gitlab",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

describe("PipelineHistoryPage", () => {
  it("renders stats grid with correct counts derived from history", async () => {
    mockGetHistory.mockResolvedValue([
      makeRun("1", "success"),
      makeRun("2", "success"),
      makeRun("3", "failed"),
      makeRun("4", "running"),
    ]);
    renderWithProviders(<PipelineHistoryPage />);

    // Wait for the actual data to populate (the static labels exist on first render).
    await waitFor(() => expect(screen.getByText("#1")).toBeInTheDocument());
    const cards = document.querySelectorAll(".stat-box");
    const values = Array.from(cards).map((c) => c.querySelector(".stat-value")?.textContent);
    expect(values).toEqual(["4", "2", "1", "1"]);
  });

  it("filters the runs list when a filter pill is clicked", async () => {
    const user = userEvent.setup();
    mockGetHistory.mockResolvedValue([
      makeRun("1", "success"),
      makeRun("2", "failed"),
      makeRun("3", "running"),
    ]);
    renderWithProviders(<PipelineHistoryPage />);

    await waitFor(() => expect(screen.getByText("#1")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^failed/i }));
    expect(screen.getByText("#2")).toBeInTheDocument();
    expect(screen.queryByText("#1")).toBeNull();
    expect(screen.queryByText("#3")).toBeNull();
  });

  it("renders the empty state when no runs match the filter", async () => {
    const user = userEvent.setup();
    mockGetHistory.mockResolvedValue([makeRun("1", "success")]);
    renderWithProviders(<PipelineHistoryPage />);

    await waitFor(() => expect(screen.getByText("#1")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^failed/i }));
    expect(screen.getByText(/no runs matching/i)).toBeInTheDocument();
  });

  it("navigates to the run page when a row is clicked", async () => {
    const user = userEvent.setup();
    mockGetHistory.mockResolvedValue([makeRun("1087", "success")]);
    renderWithProviders(<PipelineHistoryPage />);

    await waitFor(() => expect(screen.getByText("#1087")).toBeInTheDocument());

    await user.click(screen.getByText("#1087"));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("/run/1087"));
  });

  it("launch new button in the page-head navigates to the launch page", async () => {
    const user = userEvent.setup();
    mockGetHistory.mockResolvedValue([]);
    renderWithProviders(<PipelineHistoryPage />);

    await waitFor(() => expect(screen.getByRole("button", { name: /launch new/i })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /launch new/i }));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("/project/p1/pipeline/Deploy")
    );
  });

  it("shows 'Pipeline not found' when projectId/pipelineName don't resolve", () => {
    mockAuth = makeAuthValue({ projects: [] });
    renderWithProviders(<PipelineHistoryPage />);
    expect(screen.getByText(/pipeline not found/i)).toBeInTheDocument();
  });
});
