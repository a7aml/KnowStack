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
  warning: "bg-warning-bg text-warning border-warning-bg",
  danger: "bg-danger-bg text-danger border-danger-bg",
  info: "bg-navy-50 text-navy-700 border-navy-200",
};

const dotClasses: Record<BadgeTone, string> = {
  neutral: "bg-text-subtle",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-navy-500",
};

export function Badge({ tone = "neutral", className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize",
        toneClasses[tone],
        className
      )}
      {...rest}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClasses[tone])} aria-hidden="true" />
      {children}
    </span>
  );
}
