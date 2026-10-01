import type { HTMLAttributes } from "react";

export function UiBadge({ className = "", tone, ...props }: HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "info" | "accent" | "success" | "warning" | "danger";
}) {
  return <span {...props} className={`arena-badge ${className}`} data-tone={tone} />;
}
