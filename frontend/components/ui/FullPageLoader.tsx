import { Loader2 } from "lucide-react";

interface FullPageLoaderProps {
  label?: string;
}

export function FullPageLoader({ label = "Checking your session…" }: FullPageLoaderProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted">
      <div className="flex items-center gap-2.5 text-sm text-text-muted">
        <Loader2 size={16} strokeWidth={2} className="animate-spin text-text-subtle" />
        {label}
      </div>
    </div>
  );
}
