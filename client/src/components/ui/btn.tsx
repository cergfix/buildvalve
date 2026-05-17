import * as React from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "primary" | "ghost" | "danger";
type Size = "default" | "lg";

interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  kbd?: string;
}

export const Btn = React.forwardRef<HTMLButtonElement, BtnProps>(function Btn(
  { variant = "default", size = "default", icon, iconRight, kbd, className, children, type = "button", ...props },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn("btn", variant !== "default" && variant, size === "lg" && "lg", className)}
      {...props}
    >
      {icon}
      {children}
      {iconRight}
      {kbd ? <span className="kbd-hint">{kbd}</span> : null}
    </button>
  );
});
