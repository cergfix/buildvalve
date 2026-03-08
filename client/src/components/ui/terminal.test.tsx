import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Terminal, TerminalLine } from "./terminal";

describe("Terminal", () => {
  it("renders head label + line counter + body", () => {
    render(
      <Terminal label="tty/job-1002.log · utf-8" isLive visibleLines={3} totalLines={10}>
        <span>line content</span>
      </Terminal>
    );
    expect(screen.getByText("tty/job-1002.log · utf-8")).toBeInTheDocument();
    expect(screen.getByText("3 / 10 lines")).toBeInTheDocument();
    expect(screen.getByText("line content")).toBeInTheDocument();
  });

  it("shows the 'live' chip only when isLive=true", () => {
    const { rerender } = render(
      <Terminal label="x" isLive visibleLines={0} totalLines={0}>
        <span />
      </Terminal>
    );
    expect(screen.getByText("live")).toBeInTheDocument();
    rerender(
      <Terminal label="x" isLive={false} visibleLines={0} totalLines={0}>
        <span />
      </Terminal>
    );
    expect(screen.queryByText("live")).toBeNull();
  });
});

describe("TerminalLine syntax highlighting", () => {
  it("renders a fixed-width lineno + raw text", () => {
    const { container } = render(<TerminalLine lineNo={1} text="hello world" />);
    expect(container.querySelector(".lineno")?.textContent).toBe("001");
    expect(container.textContent).toContain("hello world");
  });

  it("parses [HH:MM:SS] timestamps into a dim span", () => {
    const { container } = render(<TerminalLine lineNo={1} text="[12:04:01] INFO starting" />);
    const tstamp = container.querySelector(".tstamp");
    expect(tstamp?.textContent).toContain("[12:04:01]");
  });

  it("colors level tokens — INFO=lvl-info, OK=lvl-ok, WARN=lvl-warn, ERR=lvl-err", () => {
    const a = render(<TerminalLine lineNo={1} text="[12:00:00] INFO starting" />);
    expect(a.container.querySelector(".lvl-info")).toBeInTheDocument();
    a.unmount();

    const b = render(<TerminalLine lineNo={1} text="[12:00:00] OK ready" />);
    expect(b.container.querySelector(".lvl-ok")).toBeInTheDocument();
    b.unmount();

    const c = render(<TerminalLine lineNo={1} text="[12:00:00] WARN slow" />);
    expect(c.container.querySelector(".lvl-warn")).toBeInTheDocument();
    c.unmount();

    const d = render(<TerminalLine lineNo={1} text="[12:00:00] ERR boom" />);
    expect(d.container.querySelector(".lvl-err")).toBeInTheDocument();
  });

  it("highlights known commands (npm/yarn/docker/etc.) in violet", () => {
    const { container } = render(<TerminalLine lineNo={1} text="running npm ci" />);
    const cmd = container.querySelector(".cmd");
    expect(cmd?.textContent).toBe("npm");
  });

  it("highlights paths and org/repo tokens in sky", () => {
    const { container } = render(<TerminalLine lineNo={1} text="resolving myorg/frontend" />);
    expect(container.querySelector(".path")?.textContent).toBe("myorg/frontend");
  });

  it("highlights numeric/version tokens in pink", () => {
    const { container } = render(<TerminalLine lineNo={1} text="vite v6.0.1 building" />);
    const nums = container.querySelectorAll(".num");
    // both "v6.0.1" detected as number-ish via version regex
    expect(nums.length).toBeGreaterThan(0);
  });

  it("renders the blinking cursor when showCursor=true", () => {
    const { container } = render(<TerminalLine lineNo={1} text="building" showCursor />);
    expect(container.querySelector(".cursor")).toBeInTheDocument();
  });
});
