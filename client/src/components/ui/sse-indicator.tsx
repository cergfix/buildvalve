import * as React from "react";

interface SseIndicatorProps {
  children: React.ReactNode;
}

export function SseIndicator({ children }: SseIndicatorProps) {
  return (
    <div className="sse-indicator">
      <span className="wave" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
