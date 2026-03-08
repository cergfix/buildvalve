import * as React from "react";
import { ArrowLeft } from "lucide-react";

interface CrumbProps {
  onClick?: () => void;
  children: React.ReactNode;
}

export function Crumb({ onClick, children }: CrumbProps) {
  return (
    <button type="button" className="crumb" onClick={onClick}>
      <ArrowLeft size={12} className="crumb-arrow" />
      <span>{children}</span>
    </button>
  );
}
