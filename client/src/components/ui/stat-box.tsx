import * as React from "react";

interface StatBoxProps {
  label: string;
  value: React.ReactNode;
  accent?: "emerald" | "amber" | "rose" | "sky" | "muted";
}

export function StatBox({ label, value, accent = "muted" }: StatBoxProps) {
  return (
    <div className="stat-box" data-accent={accent}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}
