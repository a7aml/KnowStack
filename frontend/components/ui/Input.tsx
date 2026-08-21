import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
  icon?: ReactNode;
}

export function Input({
  label,
  helperText,
  error,
  icon,
  id,
  className,
  ...rest
}: InputProps) {
  const inputId = id ?? rest.name;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className="text-sm font-medium text-text"
      >
        {label}
      </label>
      <div className="relative">
        {icon ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle">
            {icon}
          </span>
        ) : null}
        <input
          id={inputId}
          className={cn(
            "w-full rounded-md border border-border-strong bg-surface px-3 py-2.5 text-sm text-text placeholder:text-text-subtle",
            "transition-[border-color,box-shadow] duration-150 ease-out",
            "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
            error && "border-danger focus:ring-danger focus:border-danger",
            icon ? "pl-9" : undefined,
            className
          )}
          {...rest}
        />
      </div>
      {error ? (
        <p className="text-xs text-danger animate-fade-in">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-text-muted">{helperText}</p>
      ) : null}
    </div>
  );
}
