import { Chip, type ChipTone } from "./chip";

export type StatusState = "running" | "pending" | "created" | "success" | "failed" | "canceled" | "skipped" | string;

const stateToTone: Record<string, { label: string; tone: ChipTone }> = {
  running: { label: "running", tone: "amber" },
  pending: { label: "pending", tone: "muted" },
  created: { label: "pending", tone: "muted" },
  success: { label: "success", tone: "emerald" },
  failed: { label: "failed", tone: "rose" },
  canceled: { label: "canceled", tone: "muted" },
  skipped: { label: "skipped", tone: "muted" },
};

export function StatusChip({ state, className }: { state?: StatusState; className?: string }) {
  const s = String(state ?? "").toLowerCase();
  const info = stateToTone[s] ?? { label: s || "unknown", tone: "muted" as ChipTone };
  // Only the actually-executing state animates; "pending" / "created" stay static muted
  // since the running animation's keyframes are hard-coded amber and would clash with muted.
  const isRunning = s === "running";
  return (
    <Chip
      tone={info.tone}
      uppercase
      className={`${isRunning ? "status-running" : ""} ${className ?? ""}`.trim()}
    >
      {info.label}
    </Chip>
  );
}
