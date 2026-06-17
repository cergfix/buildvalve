import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import { PipelineLogsPage } from "./PipelineLogsPage";

(globalThis as unknown as Record<string, string>).__APP_VERSION__ = "0.0.0-test";

const mockUseLogStream = vi.fn();

vi.mock("../hooks/useSSE", () => ({
  useLogStream: () => mockUseLogStream(),
}));

const mockGetPipeline = vi.fn();
const mockTrigger = vi.fn();

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => ({ projects: [{ id: "p1", name: "Backend", pipelines: [{ name: "Deploy", variables: [] }] }] }),
}));
vi.mock("../api/queries", () => ({
  pipelinesApi: {
    getPipeline: (...args: unknown[]) => mockGetPipeline(...args),
    trigger: (...args: unknown[]) => mockTrigger(...args),
  },
  relaunchVariables: () => ({}),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ projectId: "p1", pipelineName: "Deploy", runId: "999", jobId: "1002" }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetPipeline.mockResolvedValue({
    pipeline: { id: "999", status: "running", web_url: "https://ci.example.com/pipelines/999" },
    jobs: [{ id: "1002", web_url: "https://ci.example.com/pipelines/999/jobs/1002" }],
  });
});

describe("PipelineLogsPage", () => {
  it("shows 'waiting for output…' when logs are empty and connected", () => {
    mockUseLogStream.mockReturnValue({ logs: "", isConnected: true, isDone: false });
    renderWithProviders(<PipelineLogsPage />);
    expect(screen.getByText(/waiting for output/i)).toBeInTheDocument();
  });

  it("shows 'connecting…' when logs are empty and not connected", () => {
    mockUseLogStream.mockReturnValue({ logs: "", isConnected: false, isDone: false });
    renderWithProviders(<PipelineLogsPage />);
    expect(screen.getAllByText(/connecting/i).length).toBeGreaterThan(0);
  });

  it("renders log lines and a line counter when content arrives", () => {
    mockUseLogStream.mockReturnValue({
      logs: "[12:04:01] INFO starting\n[12:04:02]   OK ready\n",
      isConnected: true,
      isDone: false,
    });
    const { container } = renderWithProviders(<PipelineLogsPage />);
    expect(container.querySelectorAll(".term-line").length).toBe(2);
    expect(screen.getByText("2 / 2 lines")).toBeInTheDocument();
  });

  it("shows the blinking cursor on the last line only while streaming", () => {
    mockUseLogStream.mockReturnValue({
      logs: "[12:04:01] INFO starting\n[12:04:02]   OK ready",
      isConnected: true,
      isDone: false,
    });
    const { container } = renderWithProviders(<PipelineLogsPage />);
    expect(container.querySelectorAll(".cursor").length).toBe(1);
  });

  it("hides the cursor and switches the indicator label when stream is done", () => {
    mockUseLogStream.mockReturnValue({
      logs: "done\n",
      isConnected: false,
      isDone: true,
    });
    const { container } = renderWithProviders(<PipelineLogsPage />);
    expect(container.querySelector(".cursor")).toBeNull();
    expect(screen.getByText(/stream closed/i)).toBeInTheDocument();
  });

  it("renders the 'live' chip in the terminal head while streaming", () => {
    mockUseLogStream.mockReturnValue({ logs: "x\n", isConnected: true, isDone: false });
    renderWithProviders(<PipelineLogsPage />);
    expect(screen.getByText("live")).toBeInTheDocument();
  });

  it("offers new launch and relaunch actions (once done) and re-triggers on relaunch", async () => {
    mockUseLogStream.mockReturnValue({ logs: "x\n", isConnected: false, isDone: true });
    mockTrigger.mockResolvedValue({ id: "2000" });

    renderWithProviders(<PipelineLogsPage />);
    expect(await screen.findByRole("button", { name: /new launch/i })).toBeInTheDocument();
    const relaunch = screen.getByRole("button", { name: /launch again/i });

    // First click arms the confirm; second click fires the relaunch.
    fireEvent.click(relaunch);
    expect(relaunch).toHaveTextContent(/confirm launch/i);
    expect(mockTrigger).not.toHaveBeenCalled();

    fireEvent.click(relaunch);
    await waitFor(() => expect(mockTrigger).toHaveBeenCalledWith("p1", "Deploy", {}));
  });

  it("hides launch actions while the run is still streaming", () => {
    mockUseLogStream.mockReturnValue({ logs: "x\n", isConnected: true, isDone: false });
    renderWithProviders(<PipelineLogsPage />);
    expect(screen.queryByRole("button", { name: /new launch/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /launch again/i })).toBeNull();
  });

  it("links out to the job's CI url once the run data resolves", async () => {
    mockUseLogStream.mockReturnValue({ logs: "x\n", isConnected: true, isDone: false });
    renderWithProviders(<PipelineLogsPage />);
    const link = await screen.findByLabelText(/open job in provider/i);
    expect(link).toHaveAttribute("href", "https://ci.example.com/pipelines/999/jobs/1002");
    expect(link).toHaveAttribute("target", "_blank");
  });
});
