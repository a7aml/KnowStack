import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-surface-sunken text-text-subtle border-border",
  success: "bg-success-bg text-success border-success-bg",
  warning: "bg-navy-50 text-navy-700 border-navy-200",
  danger: "bg-danger-bg text-danger border-danger-bg",
  info: "bg-navy-50 text-navy-700 border-navy-200",
};

export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        toneClasses[tone],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
