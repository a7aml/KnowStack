import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  helperText?: string;
  error?: string;
}

export function Input({
  label,
  helperText,
  error,
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
      <input
        id={inputId}
        className={cn(
          "w-full rounded-md border border-border-strong bg-surface px-3 py-2.5 text-sm text-text placeholder:text-text-subtle",
          "focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent",
          error && "border-danger focus:ring-danger focus:border-danger",
          className
        )}
        {...rest}
      />
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : helperText ? (
        <p className="text-xs text-text-muted">{helperText}</p>
      ) : null}
    </div>
  );
}
