import * as React from "react";
import { cn } from "@/lib/utils";

interface SectionHeadProps {
  color?: "emerald" | "amber" | "violet" | "sky" | "rose";
  flowHead?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function SectionHead({ color, flowHead, children, className }: SectionHeadProps) {
  return (
    <div className={cn("section-head", color && `c-${color}`, flowHead && "flow-head", className)}>
      <span>{children}</span>
    </div>
  );
}
