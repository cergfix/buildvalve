import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeadProps {
  color?: "emerald" | "amber" | "violet" | "sky" | "rose";
  flowHead?: boolean;
  children: React.ReactNode;
  className?: string;
  onDismiss?: () => void;
  dismissLabel?: string;
}

export function SectionHead({ color, flowHead, children, className, onDismiss, dismissLabel }: SectionHeadProps) {
  return (
    <div className={cn("section-head", color && `c-${color}`, flowHead && "flow-head", className)}>
      <span>{children}</span>
      <span className="section-rule" aria-hidden="true" />
      {onDismiss ? (
        <button
          type="button"
          className="section-head-dismiss"
          onClick={onDismiss}
          aria-label={dismissLabel ?? "dismiss"}
          title={dismissLabel ?? "dismiss"}
        >
          <X size={11} />
        </button>
      ) : null}
    </div>
  );
}
