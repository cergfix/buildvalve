import * as React from "react";
import { cn } from "@/lib/utils";

export type ChipTone = "emerald" | "amber" | "violet" | "sky" | "rose" | "pink" | "muted";

interface ChipProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
  uppercase?: boolean;
}

export function Chip({ tone, uppercase, className, children, ...props }: ChipProps) {
  return (
    <span
      className={cn("chip", uppercase && "uppercase", className)}
      data-tone={tone}
      {...props}
    >
      {children}
    </span>
  );
}
