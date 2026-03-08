import { ChevronRight, Check, X, Loader2, Circle } from "lucide-react";
import * as React from "react";

export type StageState = "success" | "running" | "pending" | "failed";

export interface StageInfo {
  name: string;
  state: StageState;
  jobCount?: number;
  statusLabel?: string;
}

function StageIcon({ state }: { state: StageState }) {
  if (state === "success") return <Check size={12} />;
  if (state === "failed") return <X size={12} />;
  if (state === "running") return <Loader2 size={12} className="animate-spin" />;
  return <Circle size={10} />;
}

export function StageFlow({ stages }: { stages: StageInfo[] }) {
  return (
    <div className="stage-flow">
      {stages.map((stage, i) => (
        <React.Fragment key={`${stage.name}-${i}`}>
          <div className="stage" data-state={stage.state}>
            <div className="stage-label">stage {String(i + 1).padStart(2, "0")}</div>
            <div className="stage-name">{stage.name}</div>
            <div className="stage-status">
              <StageIcon state={stage.state} />
              <span>{stage.statusLabel ?? defaultLabel(stage)}</span>
            </div>
          </div>
          {i < stages.length - 1 && (
            <div className="stage-arrow" aria-hidden="true">
              <ChevronRight size={16} />
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function defaultLabel(stage: StageInfo): string {
  const jobs = stage.jobCount != null ? `${stage.jobCount} jobs · ` : "";
  if (stage.state === "success") return `${jobs}ok`;
  if (stage.state === "failed") return `${jobs}failed`;
  if (stage.state === "running") return `${jobs}running…`;
  return "pending";
}
