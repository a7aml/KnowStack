import { Logo } from "@/components/ui/Logo";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <Logo />
        <p className="text-sm text-text-subtle">
          © {new Date().getFullYear()} KnowStack. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
