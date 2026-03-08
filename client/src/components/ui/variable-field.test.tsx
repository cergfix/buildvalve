import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { VariableField } from "./variable-field";

describe("VariableField", () => {
  it("renders a text input with the accent-cycled numbered badge", () => {
    const { container } = render(
      <VariableField
        config={{ key: "VERSION", value: "", locked: false }}
        value=""
        onChange={() => {}}
        index={1}
      />
    );
    expect(screen.getByText("VERSION")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    // Index 1 in the cycle (emerald → amber → violet → sky) is amber.
    expect(container.querySelector(".var-field")).toHaveAttribute("data-accent", "amber");
    expect(container.querySelector(".var-input")).toBeInTheDocument();
  });

  it("renders the locked chip and disables the input when locked=true", () => {
    const { container } = render(
      <VariableField
        config={{ key: "ENV", value: "staging", locked: true }}
        value="staging"
        onChange={() => {}}
        index={0}
      />
    );
    expect(screen.getByText("locked")).toBeInTheDocument();
    expect(container.querySelector(".var-input")).toHaveAttribute("disabled");
  });

  it("accepts user typing", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <VariableField
        config={{ key: "VERSION", value: "", locked: false }}
        value=""
        onChange={onChange}
        index={0}
      />
    );
    const input = document.querySelector(".var-input") as HTMLInputElement;
    await user.type(input, "1.2.3");
    // userEvent.type fires onChange per keystroke.
    expect(onChange).toHaveBeenCalledTimes(5);
  });

  it("renders a TechSelect for type='select' (no native <select>)", () => {
    const { container } = render(
      <VariableField
        config={{
          key: "REGION",
          value: "us-east-1",
          locked: false,
          type: "select",
          options: ["us-east-1", "eu-west-1"],
        }}
        value="us-east-1"
        onChange={() => {}}
        index={0}
      />
    );
    expect(container.querySelector(".select-trigger")).toBeInTheDocument();
    expect(container.querySelector("select")).toBeNull();
  });

  it("renders radio pills for type='radio' and toggles selection", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { container } = render(
      <VariableField
        config={{
          key: "DRY_RUN",
          value: "true",
          locked: false,
          type: "radio",
          options: ["true", "false"],
        }}
        value="true"
        onChange={onChange}
        index={0}
      />
    );
    const pills = container.querySelectorAll(".var-pill");
    expect(pills).toHaveLength(2);
    expect(pills[0].className).toContain("selected");
    expect(pills[1].className).not.toContain("selected");

    await user.click(pills[1]);
    expect(onChange).toHaveBeenCalledWith("false");
  });

  it("renders the description text when provided", () => {
    render(
      <VariableField
        config={{
          key: "REGION",
          value: "",
          locked: false,
          description: "AWS region to deploy to",
        }}
        value=""
        onChange={() => {}}
        index={0}
      />
    );
    expect(screen.getByText("AWS region to deploy to")).toBeInTheDocument();
  });
});
