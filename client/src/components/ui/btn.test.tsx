import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Btn } from "./btn";
import { Crumb } from "./crumb";

describe("Btn", () => {
  it("renders children with default type=button", () => {
    render(<Btn>launch</Btn>);
    const el = screen.getByRole("button", { name: "launch" });
    expect(el).toHaveAttribute("type", "button");
    expect(el.className).toContain("btn");
  });

  it("applies the variant + size modifier classes", () => {
    render(<Btn variant="primary" size="lg">go</Btn>);
    const el = screen.getByRole("button");
    expect(el.className).toContain("primary");
    expect(el.className).toContain("lg");
  });

  it("renders icon, iconRight and kbd slots", () => {
    render(
      <Btn icon={<span data-testid="ic-left">L</span>} iconRight={<span data-testid="ic-right">R</span>} kbd="⌘K">
        run
      </Btn>
    );
    expect(screen.getByTestId("ic-left")).toBeInTheDocument();
    expect(screen.getByTestId("ic-right")).toBeInTheDocument();
    expect(screen.getByText("⌘K").className).toContain("kbd-hint");
  });

  it("fires onClick when clicked", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Btn onClick={onClick}>click</Btn>);
    await user.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("respects disabled and does not fire onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Btn disabled onClick={onClick}>click</Btn>);
    await user.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Crumb", () => {
  it("fires onClick", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Crumb onClick={onClick}>Back to pipelines</Crumb>);
    await user.click(screen.getByText("Back to pipelines"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders an arrow + label as a button", () => {
    render(<Crumb>Back</Crumb>);
    const btn = screen.getByRole("button", { name: /back/i });
    expect(btn.className).toContain("crumb");
  });
});
