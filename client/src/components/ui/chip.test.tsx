import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Chip } from "./chip";
import { StatusChip } from "./status-chip";
import { ProviderChip } from "./provider-chip";
import { RunStatusChip } from "./run-status-chip";

describe("Chip", () => {
  it("renders content and applies tone data attribute", () => {
    render(<Chip tone="emerald">main</Chip>);
    const el = screen.getByText("main");
    expect(el).toHaveAttribute("data-tone", "emerald");
    expect(el.className).toContain("chip");
  });

  it("applies the uppercase modifier when set", () => {
    render(<Chip tone="amber" uppercase>running</Chip>);
    expect(screen.getByText("running").className).toContain("uppercase");
  });

  it("renders without a tone (default)", () => {
    render(<Chip>plain</Chip>);
    // data-tone with no value still serializes as an empty attribute; assert absence of a tone string.
    expect(screen.getByText("plain").getAttribute("data-tone")).toBeFalsy();
  });
});

describe("StatusChip", () => {
  it("maps 'running' to amber tone + animated class", () => {
    render(<StatusChip state="running" />);
    const el = screen.getByText("running");
    expect(el).toHaveAttribute("data-tone", "amber");
    expect(el.className).toContain("status-running");
  });

  it("maps 'success' to emerald and 'failed' to rose", () => {
    const { rerender } = render(<StatusChip state="success" />);
    expect(screen.getByText("success")).toHaveAttribute("data-tone", "emerald");
    rerender(<StatusChip state="failed" />);
    expect(screen.getByText("failed")).toHaveAttribute("data-tone", "rose");
  });

  it("treats 'pending' as muted and does not animate", () => {
    render(<StatusChip state="pending" />);
    const el = screen.getByText("pending");
    expect(el).toHaveAttribute("data-tone", "muted");
    expect(el.className).not.toContain("status-running");
  });

  it("falls back to muted + raw label for unknown states", () => {
    render(<StatusChip state="canceled" />);
    expect(screen.getByText("canceled")).toHaveAttribute("data-tone", "muted");
  });
});

describe("ProviderChip", () => {
  it("maps each known provider to its tone + label", () => {
    const cases = [
      { type: "gitlab", label: "gitlab", tone: "amber" },
      { type: "github-actions", label: "github", tone: "violet" },
      { type: "circleci", label: "circleci", tone: "emerald" },
    ];
    for (const { type, label, tone } of cases) {
      const { unmount } = render(<ProviderChip type={type} />);
      const el = screen.getByText(label);
      expect(el).toHaveAttribute("data-tone", tone);
      unmount();
    }
  });

  it("renders unknown provider as muted with the raw type", () => {
    render(<ProviderChip type="bitbucket" />);
    expect(screen.getByText("bitbucket")).toHaveAttribute("data-tone", "muted");
  });
});

describe("RunStatusChip", () => {
  it("renders the spinner for running states", () => {
    const { container } = render(<RunStatusChip state="running" />);
    expect(container.querySelector(".run-status-chip")).toHaveAttribute("data-tone", "amber");
    expect(container.querySelector(".spin")).toBeInTheDocument();
  });

  it("renders the check glyph for success", () => {
    const { container } = render(<RunStatusChip state="success" />);
    expect(container.querySelector(".run-status-chip")).toHaveAttribute("data-tone", "emerald");
    expect(container.querySelector(".spin")).toBeNull();
  });

  it("renders the rose tone for failed", () => {
    const { container } = render(<RunStatusChip state="failed" />);
    expect(container.querySelector(".run-status-chip")).toHaveAttribute("data-tone", "rose");
  });
});
