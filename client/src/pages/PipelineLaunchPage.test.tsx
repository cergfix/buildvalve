import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, makeAuthValue, type MockAuthValue } from "../test-utils";
import { PipelineLaunchPage } from "./PipelineLaunchPage";

(globalThis as unknown as Record<string, string>).__APP_VERSION__ = "0.0.0-test";

let mockAuth: MockAuthValue;
const mockTrigger = vi.fn();
const mockNavigate = vi.fn();

vi.mock("../contexts/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

vi.mock("../api/queries", () => ({
  pipelinesApi: {
    trigger: (...args: unknown[]) => mockTrigger(...args),
  },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ projectId: "p1", pipelineName: "Deploy" }),
  };
});

function makeProject(extraVariables: unknown[] = []) {
  return {
    id: "p1",
    name: "My App",
    provider: "gitlab",
    pipelines: [
      {
        name: "Deploy",
        ref: "main",
        providerType: "gitlab",
        variables: [
          {
            key: "ENVIRONMENT",
            value: "staging",
            locked: false,
            type: "select",
            options: ["staging", "production"],
          },
          { key: "VERSION", value: "", locked: false, required: true, description: "Docker tag" },
          ...extraVariables,
        ],
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuth = makeAuthValue({ projects: [makeProject()] });
});

describe("PipelineLaunchPage", () => {
  it("renders the kebab title + ref chip", () => {
    renderWithProviders(<PipelineLaunchPage />);
    // Lowercased kebab of "Deploy" = "deploy".
    expect(screen.getByText("deploy")).toBeInTheDocument();
    // Ref chip.
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("renders one VariableField per visible variable", () => {
    renderWithProviders(<PipelineLaunchPage />);
    expect(screen.getByText("ENVIRONMENT")).toBeInTheDocument();
    expect(screen.getByText("VERSION")).toBeInTheDocument();
    // Required chip on VERSION.
    expect(screen.getByText("required")).toBeInTheDocument();
  });

  it("hides a needs-gated variable until the trigger condition matches", async () => {
    const user = userEvent.setup();
    mockAuth = makeAuthValue({
      projects: [
        makeProject([
          {
            key: "NOTIFY_STAKEHOLDERS",
            value: "false",
            locked: false,
            type: "radio",
            options: ["true", "false"],
            needs: { ENVIRONMENT: "production" },
          },
        ]),
      ],
    });
    renderWithProviders(<PipelineLaunchPage />);

    // Hidden initially (ENVIRONMENT defaults to "staging").
    expect(screen.queryByText("NOTIFY_STAKEHOLDERS")).toBeNull();

    // Open the TechSelect and pick "production".
    const trigger = document.querySelector(".select-trigger") as HTMLButtonElement;
    await user.click(trigger);
    await user.click(screen.getByText("production"));

    expect(screen.getByText("NOTIFY_STAKEHOLDERS")).toBeInTheDocument();
  });

  it("supports multi-key AND in needs (ENV + DRY_RUN)", async () => {
    const user = userEvent.setup();
    mockAuth = makeAuthValue({
      projects: [
        makeProject([
          {
            key: "DRY_RUN",
            value: "true",
            locked: false,
            type: "radio",
            options: ["true", "false"],
          },
          {
            key: "ROLLBACK_VERSION",
            value: "",
            locked: false,
            needs: { ENVIRONMENT: ["staging", "production"], DRY_RUN: "false" },
          },
        ]),
      ],
    });
    renderWithProviders(<PipelineLaunchPage />);

    expect(screen.queryByText("ROLLBACK_VERSION")).toBeNull();

    // Toggle DRY_RUN to "false" via the radio pill.
    const falsePill = Array.from(document.querySelectorAll(".var-pill")).find(
      (p) => p.textContent === "false"
    ) as HTMLButtonElement;
    await user.click(falsePill);

    expect(screen.getByText("ROLLBACK_VERSION")).toBeInTheDocument();
  });

  it("submits only the visible (needs-satisfied) variables on launch", async () => {
    const user = userEvent.setup();
    mockTrigger.mockResolvedValue({ id: "999" });
    mockAuth = makeAuthValue({
      projects: [
        makeProject([
          {
            key: "NOTIFY_STAKEHOLDERS",
            value: "false",
            locked: false,
            type: "radio",
            options: ["true", "false"],
            needs: { ENVIRONMENT: "production" },
          },
        ]),
      ],
    });
    renderWithProviders(<PipelineLaunchPage />);

    // Type a VERSION (required) but leave ENVIRONMENT=staging so NOTIFY stays hidden.
    const versionInput = (document.querySelectorAll(".var-input")[0] as HTMLInputElement);
    await user.type(versionInput, "v1.2.3");

    // Touch NOTIFY's default via state-no-op: the field is hidden, so we never set it.
    await user.click(screen.getByRole("button", { name: /launch pipeline/i }));

    await waitFor(() => expect(mockTrigger).toHaveBeenCalledTimes(1));
    const submitted = mockTrigger.mock.calls[0][2];
    expect(submitted).toEqual({ ENVIRONMENT: "staging", VERSION: "v1.2.3" });
    expect(submitted).not.toHaveProperty("NOTIFY_STAKEHOLDERS");
  });

  it("navigates to the run page on successful trigger", async () => {
    const user = userEvent.setup();
    mockTrigger.mockResolvedValue({ id: "1234" });
    renderWithProviders(<PipelineLaunchPage />);

    const versionInput = document.querySelectorAll(".var-input")[0] as HTMLInputElement;
    await user.type(versionInput, "v1");

    await user.click(screen.getByRole("button", { name: /launch pipeline/i }));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        expect.stringContaining("/project/p1/pipeline/Deploy/run/1234")
      )
    );
  });

  it("Back to pipelines navigates to /", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PipelineLaunchPage />);
    await user.click(screen.getByText(/back to pipelines/i));
    expect(mockNavigate).toHaveBeenCalledWith("/");
  });

  it("shows pipeline-not-found when projectId is missing", () => {
    mockAuth = makeAuthValue({ projects: [] });
    renderWithProviders(<PipelineLaunchPage />);
    expect(screen.getByText(/pipeline not found/i)).toBeInTheDocument();
  });
});
