import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TechSelect } from "./tech-select";

describe("TechSelect", () => {
  it("renders the placeholder when value is empty and opens on click", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TechSelect value="" onChange={onChange} options={["staging", "production"]} placeholder="select" />
    );
    expect(screen.getByText("select")).toBeInTheDocument();
    // Menu hidden by default
    expect(document.querySelector(".select-menu")).toBeNull();

    await user.click(screen.getByRole("button"));
    expect(document.querySelector(".select-menu")).toBeInTheDocument();
    expect(screen.getByText("staging")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
  });

  it("emits onChange and closes when an option is clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TechSelect value="" onChange={onChange} options={["a", "b"]} />);
    await user.click(screen.getByRole("button"));
    await user.click(screen.getByText("b"));
    expect(onChange).toHaveBeenCalledWith("b");
    expect(document.querySelector(".select-menu")).toBeNull();
  });

  it("marks the current value as selected with ▸ and ✓", async () => {
    const user = userEvent.setup();
    render(<TechSelect value="b" onChange={() => {}} options={["a", "b", "c"]} />);
    await user.click(screen.getByRole("button"));
    const selected = document.querySelector(".select-option.selected");
    expect(selected?.textContent).toContain("b");
    expect(selected?.querySelector("svg")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<TechSelect value="" onChange={() => {}} options={["a", "b"]} />);
    await user.click(screen.getByRole("button"));
    expect(document.querySelector(".select-menu")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(document.querySelector(".select-menu")).toBeNull();
  });

  it("closes when clicking outside", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <TechSelect value="" onChange={() => {}} options={["a"]} />
        <button>outside</button>
      </div>
    );
    await user.click(screen.getByRole("button", { name: "select" }));
    expect(document.querySelector(".select-menu")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "outside" }));
    expect(document.querySelector(".select-menu")).toBeNull();
  });

  it("supports ArrowDown + Enter for keyboard selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<TechSelect value="" onChange={onChange} options={["x", "y", "z"]} />);
    const trigger = screen.getByRole("button");
    await user.click(trigger);
    // Initial focusIndex is -1 (no selected value). ArrowDown moves to 0.
    await user.keyboard("{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledWith("x");
  });

  it("respects disabled — does not open on click", async () => {
    const user = userEvent.setup();
    render(<TechSelect value="" onChange={() => {}} options={["a"]} disabled />);
    await user.click(screen.getByRole("button"));
    expect(document.querySelector(".select-menu")).toBeNull();
  });

  it("shows the empty option when allowEmpty is true", async () => {
    const user = userEvent.setup();
    render(<TechSelect value="" onChange={() => {}} options={["a", "b"]} allowEmpty />);
    await user.click(screen.getByRole("button"));
    expect(screen.getByText(/none/i)).toBeInTheDocument();
  });

  it("applies the accent data attribute", () => {
    const { container } = render(
      <TechSelect value="" onChange={() => {}} options={["a"]} accent="amber" />
    );
    expect(container.querySelector(".select")).toHaveAttribute("data-accent", "amber");
  });
});
