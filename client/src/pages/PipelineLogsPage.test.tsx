import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import { PipelineLogsPage } from "./PipelineLogsPage";

(globalThis as unknown as Record<string, string>).__APP_VERSION__ = "0.0.0-test";

const mockUseLogStream = vi.fn();

vi.mock("../hooks/useSSE", () => ({
  useLogStream: () => mockUseLogStream(),
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
});
