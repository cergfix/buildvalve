import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PageHead } from "./page-head";
import { SectionHead } from "./section-head";
import { StatBox } from "./stat-box";
import { SseIndicator } from "./sse-indicator";

describe("PageHead", () => {
  it("renders kicker, ver, title and sub", () => {
    render(
      <PageHead
        kicker={<span>LAUNCH</span>}
        ver=" v0.4.0"
        title="deploy-to-staging"
        slashed
        sub="Configure parameters."
      />
    );
    expect(screen.getByText("LAUNCH")).toBeInTheDocument();
    expect(screen.getByText("v0.4.0")).toBeInTheDocument();
    expect(screen.getByText("deploy-to-staging")).toBeInTheDocument();
    expect(screen.getByText("Configure parameters.")).toBeInTheDocument();
  });

  it("renders the emerald slash prefix only when slashed=true", () => {
    const { container, rerender } = render(<PageHead title="pipelines" />);
    expect(container.querySelector(".slash")).toBeNull();
    rerender(<PageHead title="pipelines" slashed />);
    expect(container.querySelector(".slash")).toBeInTheDocument();
  });

  it("renders the action slot when provided", () => {
    render(
      <PageHead title="history" action={<button>launch new</button>} />
    );
    expect(screen.getByRole("button", { name: "launch new" })).toBeInTheDocument();
  });
});

describe("SectionHead", () => {
  it("applies color modifier", () => {
    const { container } = render(<SectionHead color="sky">overview</SectionHead>);
    expect(container.querySelector(".section-head")?.className).toContain("c-sky");
  });

  it("renders the dismiss button only when onDismiss is provided", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    const { container, rerender } = render(<SectionHead>plain</SectionHead>);
    expect(container.querySelector(".section-head-dismiss")).toBeNull();

    rerender(<SectionHead onDismiss={onDismiss} dismissLabel="hide">how to launch</SectionHead>);
    const close = screen.getByLabelText("hide");
    expect(close).toBeInTheDocument();
    await user.click(close);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("adds the flow-head modifier", () => {
    const { container } = render(<SectionHead flowHead>how to launch</SectionHead>);
    expect(container.querySelector(".section-head")?.className).toContain("flow-head");
  });
});

describe("StatBox", () => {
  it("renders label + value + accent attribute", () => {
    const { container } = render(<StatBox label="success" value={42} accent="emerald" />);
    expect(screen.getByText("success")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(container.querySelector(".stat-box")).toHaveAttribute("data-accent", "emerald");
  });

  it("defaults accent to muted when omitted", () => {
    const { container } = render(<StatBox label="total" value={0} />);
    expect(container.querySelector(".stat-box")).toHaveAttribute("data-accent", "muted");
  });
});

describe("SseIndicator", () => {
  it("renders the wave dot + children", () => {
    const { container } = render(<SseIndicator>live streaming</SseIndicator>);
    expect(screen.getByText("live streaming")).toBeInTheDocument();
    expect(container.querySelector(".wave")).toBeInTheDocument();
  });
});
