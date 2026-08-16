import Link from "next/link";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";

export function MarketingHeader() {
  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" aria-label="KnowStack home">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <a
            href="#features"
            className="text-sm font-medium text-text-muted hover:text-text"
          >
            Platform
          </a>
          <a
            href="#how-it-works"
            className="text-sm font-medium text-text-muted hover:text-text"
          >
            How it works
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <Button href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            Employee sign in
          </Button>
          <Button href="/admin/login" variant="secondary" size="sm">
            Admin sign in
          </Button>
        </div>
      </div>
    </header>
  );
}
