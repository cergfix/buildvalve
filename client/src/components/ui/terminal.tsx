import * as React from "react";
import { Chip } from "./chip";

interface TerminalProps {
  label: string;
  isLive: boolean;
  visibleLines: number;
  totalLines: number;
  children: React.ReactNode;
  bodyRef?: React.Ref<HTMLDivElement>;
}

export function Terminal({ label, isLive, visibleLines, totalLines, children, bodyRef }: TerminalProps) {
  return (
    <div className="terminal">
      <div className="terminal-head">
        <div className="dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <div className="label">{label}</div>
        <div className="meta">
          {isLive ? <Chip tone="emerald" uppercase>live</Chip> : null}
          <span>
            {visibleLines} / {totalLines} lines
          </span>
        </div>
      </div>
      <div className="terminal-body" ref={bodyRef}>
        {children}
      </div>
    </div>
  );
}

const LEVEL_RE = /^(INFO|OK|WARN|ERR|ERROR|DEBUG)\b\s*/i;
const TIMESTAMP_RE = /^\[(\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]\s*/;

/**
 * Parse a single log line into a structured rendering of:
 *   <lineno> [timestamp] LEVEL <body with syntax highlight>
 *
 * Syntax highlight rules (very lightweight):
 *   - commands (npm ..., npm ci, npm run build, vite ..., node ..., yarn ..., pnpm ..., docker ..., curl ...) → violet
 *   - paths starting with `/` or org/repo-shaped (a/b) → sky
 *   - numbers (including units like "13s", "1284", "v2.318.0", "v6.0.1") → pink
 */
export function TerminalLine({ lineNo, text, showCursor }: { lineNo: number; text: string; showCursor?: boolean }) {
  let rest = text;

  let tstamp: string | null = null;
  const ts = TIMESTAMP_RE.exec(rest);
  if (ts) {
    tstamp = ts[0].trim();
    rest = rest.slice(ts[0].length);
  }

  let level: string | null = null;
  const lvl = LEVEL_RE.exec(rest);
  if (lvl) {
    level = lvl[1].toUpperCase();
    rest = rest.slice(lvl[0].length);
  }

  return (
    <span className="term-line">
      <span className="lineno">{String(lineNo).padStart(3, "0")}</span>
      {tstamp ? <span className="tstamp">{tstamp} </span> : null}
      {level ? <span className={levelClass(level)}>{padLevel(level)} </span> : null}
      <Highlighted text={rest} />
      {showCursor ? <span className="cursor" aria-hidden="true" /> : null}
    </span>
  );
}

function padLevel(level: string): string {
  // Match the design's 4-char level tokens — "INFO", "  OK", "WARN", "ERR "
  if (level === "OK") return "  OK";
  if (level === "ERR" || level === "ERROR") return "ERR ";
  if (level === "WARN") return "WARN";
  if (level === "INFO") return "INFO";
  if (level === "DEBUG") return "DBG ";
  return level.padEnd(4).slice(0, 4);
}

function levelClass(level: string): string {
  if (level === "OK") return "lvl-ok";
  if (level === "ERR" || level === "ERROR") return "lvl-err";
  if (level === "WARN") return "lvl-warn";
  return "lvl-info";
}

const COMMANDS = new Set([
  "npm",
  "npx",
  "yarn",
  "pnpm",
  "node",
  "vite",
  "docker",
  "curl",
  "git",
  "make",
  "cargo",
  "go",
  "python",
  "pip",
  "bash",
  "sh",
]);

function Highlighted({ text }: { text: string }) {
  // Walk the line token-by-token, emit colored spans for known patterns.
  const out: React.ReactNode[] = [];
  const re = /(\s+|[^\s]+)/g;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text))) {
    const tok = m[0];
    if (/^\s+$/.test(tok)) {
      out.push(tok);
      continue;
    }
    if (COMMANDS.has(tok)) {
      out.push(<span key={key++} className="cmd">{tok}</span>);
      continue;
    }
    // Trailing punctuation handling
    const numMatch = /^(v?\d[\d.]*[a-z]*)([.,;:!?…]*)$/i.exec(tok);
    if (numMatch) {
      out.push(<span key={key++} className="num">{numMatch[1]}</span>);
      if (numMatch[2]) out.push(numMatch[2]);
      continue;
    }
    if (/^\/[\w./-]+/.test(tok) || /^[\w-]+\/[\w./-]+/.test(tok)) {
      out.push(<span key={key++} className="path">{tok}</span>);
      continue;
    }
    out.push(tok);
  }
  return <>{out}</>;
}
