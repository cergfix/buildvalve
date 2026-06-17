import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders, makeAuthValue, type MockAuthValue } from "../test-utils";
import { PipelineRunPage } from "./PipelineRunPage";

(globalThis as unknown as Record<string, string>).__APP_VERSION__ = "0.0.0-test";

let mockAuth: MockAuthValue;
const mockGetPipeline = vi.fn();
const mockTrigger = vi.fn();
const mockUsePipelineStream = vi.fn();

vi.mock("../contexts/AuthContext", () => ({ useAuth: () => mockAuth }));
vi.mock("../api/queries", () => ({
  pipelinesApi: {
    getPipeline: (...a: unknown[]) => mockGetPipeline(...a),
    trigger: (...a: unknown[]) => mockTrigger(...a),
  },
  relaunchVariables: () => ({}),
}));
vi.mock("../hooks/useSSE", () => ({
  usePipelineStream: () => mockUsePipelineStream(),
}));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ projectId: "p1", pipelineName: "Deploy", runId: "999" }),
  };
});

function makeJobs(running: boolean) {
  return [
    {
      id: "1",
      name: "checkout",
      stage: "source",
      status: "success",
      started_at: "2025-01-01T00:00:00Z",
      finished_at: "2025-01-01T00:00:05Z",
      duration: 5,
      web_url: "x",
    },
    {
      id: "2",
      name: "build",
      stage: "build",
      status: running ? "running" : "success",
      started_at: "2025-01-01T00:00:05Z",
      finished_at: running ? null : "2025-01-01T00:00:20Z",
      duration: running ? null : 15,
      web_url: "x",
    },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = makeAuthValue({ projects: [{ id: "p1", name: "Backend", provider: "gitlab", pipelines: [] }] });
});

describe("PipelineRunPage", () => {
  it("renders the run id with emerald # prefix + the ref chip", async () => {
    mockGetPipeline.mockResolvedValue({
      pipeline: {
        id: "1554", status: "success", ref: "main", web_url: "x",
        created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:30Z", provider: "gitlab",
      },
      jobs: makeJobs(false),
    });
    mockUsePipelineStream.mockReturnValue({ data: undefined, isConnected: false });

    renderWithProviders(<PipelineRunPage />);

    await waitFor(() => expect(screen.getByText("#1554")).toBeInTheDocument());
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("derives stages from jobs and renders one stage per group", async () => {
    mockGetPipeline.mockResolvedValue({
      pipeline: {
        id: "1", status: "running", ref: "main", web_url: "x",
        created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:30Z",
      },
      jobs: makeJobs(true),
    });
    mockUsePipelineStream.mockReturnValue({ data: undefined, isConnected: true });

    const { container } = renderWithProviders(<PipelineRunPage />);

    await waitFor(() => expect(container.querySelectorAll(".stage").length).toBe(2));
    // Stage matching "build" should be in running state.
    const buildStage = Array.from(container.querySelectorAll(".stage")).find((s) =>
      s.textContent?.includes("build")
    );
    expect(buildStage).toHaveAttribute("data-state", "running");
  });

  it("shows the SSE indicator only when pipeline is running", async () => {
    mockGetPipeline.mockResolvedValue({
      pipeline: {
        id: "777", status: "success", ref: "main", web_url: "x",
        created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:30Z",
      },
      jobs: makeJobs(false),
    });
    mockUsePipelineStream.mockReturnValue({ data: undefined, isConnected: false });

    const { container } = renderWithProviders(<PipelineRunPage />);
    await waitFor(() => expect(screen.getByText("#777")).toBeInTheDocument());
    expect(container.querySelector(".sse-indicator")).toBeNull();
  });

  it("renders the SSE indicator when running", async () => {
    mockGetPipeline.mockResolvedValue({
      pipeline: {
        id: "1", status: "running", ref: "main", web_url: "x",
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
      jobs: makeJobs(true),
    });
    mockUsePipelineStream.mockReturnValue({ data: undefined, isConnected: true });

    const { container } = renderWithProviders(<PipelineRunPage />);
    await waitFor(() => expect(container.querySelector(".sse-indicator")).toBeInTheDocument());
  });

  it("renders one row per job with stage + status + duration cells", async () => {
    mockGetPipeline.mockResolvedValue({
      pipeline: {
        id: "555", status: "success", ref: "main", web_url: "x",
        created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:30Z",
      },
      jobs: makeJobs(false),
    });
    mockUsePipelineStream.mockReturnValue({ data: undefined, isConnected: false });

    const { container } = renderWithProviders(<PipelineRunPage />);
    await waitFor(() => expect(screen.getByText("checkout")).toBeInTheDocument());
    // "build" appears as both a stage card and a job row — use the table cell directly.
    expect(container.querySelector(".jobs-table .job-name")?.textContent).toContain("checkout");
    // Duration formatted as "5s" for the 5s job.
    expect(screen.getByText("5s")).toBeInTheDocument();
  });

  it("shows relaunch + new launch on a finished run and re-triggers", async () => {
    mockGetPipeline.mockResolvedValue({
      pipeline: {
        id: "1554", status: "success", ref: "main", web_url: "x",
        created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:30Z",
      },
      jobs: makeJobs(false),
    });
    mockUsePipelineStream.mockReturnValue({ data: undefined, isConnected: false });
    mockTrigger.mockResolvedValue({ id: "1600" });

    renderWithProviders(<PipelineRunPage />);
    expect(await screen.findByRole("button", { name: /new launch/i })).toBeInTheDocument();
    const relaunch = screen.getByRole("button", { name: /launch again/i });

    // First click only arms the confirm — it must NOT trigger yet.
    fireEvent.click(relaunch);
    expect(relaunch).toHaveTextContent(/confirm launch/i);
    expect(mockTrigger).not.toHaveBeenCalled();

    // Second click within the window fires the relaunch.
    fireEvent.click(relaunch);
    await waitFor(() => expect(mockTrigger).toHaveBeenCalledWith("p1", "Deploy", {}));
  });

  it("hides relaunch and shows stop while the run is in progress", async () => {
    mockGetPipeline.mockResolvedValue({
      pipeline: {
        id: "1", status: "running", ref: "main", web_url: "x",
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      },
      jobs: makeJobs(true),
    });
    mockUsePipelineStream.mockReturnValue({ data: undefined, isConnected: true });

    renderWithProviders(<PipelineRunPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /stop run/i })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /launch again/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /new launch/i })).toBeNull();
  });
});
