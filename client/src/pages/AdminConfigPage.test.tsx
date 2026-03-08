import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../test-utils";
import { AdminConfigPage } from "./AdminConfigPage";

(globalThis as unknown as Record<string, string>).__APP_VERSION__ = "0.0.0-test";

const mockGetConfig = vi.fn();

vi.mock("../api/queries", () => ({
  adminApi: { getConfig: () => mockGetConfig() },
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = (await importOriginal()) as object;
  return { ...actual, useNavigate: () => vi.fn() };
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminConfigPage", () => {
  it("renders the loaded config payload as JSON in the terminal body", async () => {
    mockGetConfig.mockResolvedValue({ projects: [{ id: "p1", name: "Backend" }] });
    renderWithProviders(<AdminConfigPage />);
    await waitFor(() =>
      expect(screen.getByText(/"projects"/)).toBeInTheDocument()
    );
    expect(screen.getByText(/Backend/)).toBeInTheDocument();
  });

  it("renders the access-denied state on a 403/error", async () => {
    mockGetConfig.mockRejectedValue(new Error("Forbidden"));
    renderWithProviders(<AdminConfigPage />);
    await waitFor(() =>
      expect(screen.getByText(/access denied/i)).toBeInTheDocument()
    );
  });
});
