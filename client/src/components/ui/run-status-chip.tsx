import { Check, X } from "lucide-react";

type Tone = "amber" | "emerald" | "rose";

const stateToTone: Record<string, { tone: Tone; label: string }> = {
  running: { tone: "amber", label: "running" },
  pending: { tone: "amber", label: "pending" },
  created: { tone: "amber", label: "pending" },
  success: { tone: "emerald", label: "success" },
  failed: { tone: "rose", label: "failed" },
  canceled: { tone: "rose", label: "canceled" },
};

export function RunStatusChip({ state }: { state?: string }) {
  const s = String(state ?? "").toLowerCase();
  const info = stateToTone[s] ?? { tone: "amber" as Tone, label: s || "unknown" };
  return (
    <div className="run-status-chip" data-tone={info.tone}>
      {info.tone === "amber" ? (
        <span className="spin" aria-hidden="true" />
      ) : info.tone === "emerald" ? (
        <Check size={14} />
      ) : (
        <X size={14} />
      )}
      <span>{info.label}</span>
    </div>
  );
}
