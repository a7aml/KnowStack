import { Menu } from "lucide-react";

interface TopbarProps {
  title: string;
  onMenuClick: () => void;
}

export function Topbar({ title, onMenuClick }: TopbarProps) {
  return (
    <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-4 sm:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Toggle navigation menu"
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border-strong text-text-muted transition-colors hover:bg-surface-sunken lg:hidden"
      >
        <Menu size={18} strokeWidth={1.75} />
      </button>

      <h1 className="text-xl font-semibold tracking-tight text-navy-950">{title}</h1>
    </header>
  );
}
