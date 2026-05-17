import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, makeAuthValue, type MockAuthValue } from "../test-utils";
import { PipelinesPage } from "./PipelinesPage";

(globalThis as unknown as Record<string, string>).__APP_VERSION__ = "0.0.0-test";

let mockAuth: MockAuthValue;
const mockNavigate = vi.fn();

vi.mock("../contexts/AuthContext", () => ({ useAuth: () => mockAuth }));
vi.mock("../api/queries", () => ({ pipelinesApi: { getRecent: vi.fn().mockResolvedValue([]) } }));
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return { ...actual, useNavigate: () => mockNavigate };
});

const FLOW_KEY = "buildvalve.flowPanelDismissed";

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem(FLOW_KEY);
  mockAuth = makeAuthValue({
    projects: [
      {
        id: "p1",
        name: "Backend API",
        provider: "gitlab",
        description: "Main service",
        pipelines: [
          { name: "Deploy", ref: "main", providerType: "gitlab", variables: [] },
        ],
      },
    ],
  });
});

describe("PipelinesPage", () => {
  it("renders the page head and project section", () => {
    renderWithProviders(<PipelinesPage />);
    expect(screen.getByText("pipelines")).toBeInTheDocument();
    expect(screen.getByText("Backend API")).toBeInTheDocument();
    expect(screen.getByText("Deploy")).toBeInTheDocument();
  });

  it("filters projects/pipelines by search query", async () => {
    const user = userEvent.setup();
    mockAuth = makeAuthValue({
      projects: [
        {
          id: "a",
          name: "Alpha",
          provider: "gitlab",
          pipelines: [{ name: "deploy", ref: "main", providerType: "gitlab", variables: [] }],
        },
        {
          id: "b",
          name: "Beta",
          provider: "github-actions",
          pipelines: [{ name: "release", ref: "main", providerType: "github-actions", variables: [] }],
        },
      ],
    });
    renderWithProviders(<PipelinesPage />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText(/search projects/i), "alpha");
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Beta")).toBeNull();
  });

  it("renders the 'how to launch' panel by default and dismisses + persists to localStorage", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PipelinesPage />);
    expect(screen.getByText("how to launch")).toBeInTheDocument();

    await user.click(screen.getByLabelText(/hide how-to-launch/i));

    expect(screen.queryByText("how to launch")).toBeNull();
    expect(localStorage.getItem(FLOW_KEY)).toBe("1");
  });

  it("hides the panel on mount when localStorage flag is set", () => {
    localStorage.setItem(FLOW_KEY, "1");
    renderWithProviders(<PipelinesPage />);
    expect(screen.queryByText("how to launch")).toBeNull();
  });

  it("navigates to the launch page when the row's launch button is clicked", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PipelinesPage />);
    await user.click(screen.getByRole("button", { name: /^launch$/i }));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("/project/p1/pipeline/Deploy")
    );
  });

  it("navigates to the history page from the row's history button", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PipelinesPage />);
    await user.click(screen.getByRole("button", { name: /history/i }));
    expect(mockNavigate).toHaveBeenCalledWith(
      expect.stringContaining("/history")
    );
  });

  it("shows 'no projects' state when the auth context has zero projects", () => {
    mockAuth = makeAuthValue({ projects: [] });
    renderWithProviders(<PipelinesPage />);
    expect(screen.getByText(/do not have access/i)).toBeInTheDocument();
  });

  it("opens the run via status-link when there's a recent run", async () => {
    const user = userEvent.setup();
    const { pipelinesApi } = await import("../api/queries");
    (pipelinesApi.getRecent as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        projectId: "p1",
        pipelines: [{ id: "999", status: "success", ref: "main", web_url: "x", provider: "gitlab" }],
      },
    ]);
    renderWithProviders(<PipelinesPage />);
    await waitFor(() => expect(screen.getByText("success")).toBeInTheDocument());
    await user.click(screen.getByText("success"));
    expect(mockNavigate).toHaveBeenCalledWith(expect.stringContaining("/run/999"));
  });
});
