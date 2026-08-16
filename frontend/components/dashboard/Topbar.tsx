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
        className="flex h-9 w-9 items-center justify-center rounded-md border border-border-strong text-text-muted hover:bg-surface-sunken lg:hidden"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 18 18"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 4.5H16M2 9H16M2 13.5H16"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      <h1 className="text-base font-semibold text-navy-950">{title}</h1>
    </header>
  );
}
