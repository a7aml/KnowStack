import type { HTMLAttributes, ReactNode } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type AlertTone = "danger" | "success";

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone: AlertTone;
  children: ReactNode;
}

const toneClasses: Record<AlertTone, string> = {
  danger: "border-danger-bg bg-danger-bg text-danger",
  success: "border-success-bg bg-success-bg text-success",
};

const toneIcon: Record<AlertTone, typeof AlertCircle> = {
  danger: AlertCircle,
  success: CheckCircle2,
};

export function Alert({ tone, className, children, ...rest }: AlertProps) {
  const Icon = toneIcon[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2 text-sm animate-fade-in-up",
        toneClasses[tone],
        className
      )}
      {...rest}
    >
      <Icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}
