import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FlowDiagram } from "./flow-diagram";
import { StageFlow, type StageInfo } from "./stage-flow";

describe("FlowDiagram", () => {
  it("renders 4 flow cards with numbered badges + accent cycle", () => {
    const { container } = render(<FlowDiagram />);
    const cards = container.querySelectorAll(".flow-card");
    expect(cards).toHaveLength(4);

    // Numbered badges 01..04
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
    expect(screen.getByText("04")).toBeInTheDocument();

    // Accent cycle: emerald → amber → violet → sky
    expect(cards[0]).toHaveAttribute("data-accent", "emerald");
    expect(cards[1]).toHaveAttribute("data-accent", "amber");
    expect(cards[2]).toHaveAttribute("data-accent", "violet");
    expect(cards[3]).toHaveAttribute("data-accent", "sky");
  });

  it("sets data-next on each card to the next card's accent (last is empty)", () => {
    const { container } = render(<FlowDiagram />);
    const cards = container.querySelectorAll(".flow-card");
    expect(cards[0]).toHaveAttribute("data-next", "amber");
    expect(cards[1]).toHaveAttribute("data-next", "violet");
    expect(cards[2]).toHaveAttribute("data-next", "sky");
    expect(cards[3]).toHaveAttribute("data-next", "");
  });

  it("renders the dashed wire element", () => {
    const { container } = render(<FlowDiagram />);
    expect(container.querySelector(".flow-wire")).toBeInTheDocument();
  });
});

describe("StageFlow", () => {
  const stages: StageInfo[] = [
    { name: "source", state: "success", jobCount: 1 },
    { name: "build", state: "success", jobCount: 2 },
    { name: "deploy", state: "running", jobCount: 1 },
    { name: "verify", state: "pending", jobCount: 0 },
  ];

  it("renders one .stage per input + (n-1) arrows between them", () => {
    const { container } = render(<StageFlow stages={stages} />);
    expect(container.querySelectorAll(".stage")).toHaveLength(4);
    expect(container.querySelectorAll(".stage-arrow")).toHaveLength(3);
  });

  it("sets data-state on each stage for its accent", () => {
    const { container } = render(<StageFlow stages={stages} />);
    const cards = container.querySelectorAll(".stage");
    expect(cards[0]).toHaveAttribute("data-state", "success");
    expect(cards[2]).toHaveAttribute("data-state", "running");
    expect(cards[3]).toHaveAttribute("data-state", "pending");
  });

  it("uses default labels when statusLabel is not provided", () => {
    render(<StageFlow stages={stages} />);
    // Numbered stage labels exist as STAGE 01..STAGE 04 in chrome.
    expect(screen.getByText(/stage 01/i)).toBeInTheDocument();
    expect(screen.getByText(/stage 04/i)).toBeInTheDocument();
    // Status text reflects state.
    expect(screen.getByText(/running…/)).toBeInTheDocument();
    expect(screen.getByText(/pending/)).toBeInTheDocument();
  });

  it("renders a single stage with no arrows", () => {
    const { container } = render(<StageFlow stages={[{ name: "build", state: "success" }]} />);
    expect(container.querySelectorAll(".stage")).toHaveLength(1);
    expect(container.querySelectorAll(".stage-arrow")).toHaveLength(0);
  });
});
