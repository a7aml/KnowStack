import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  enabled: boolean;
  icon: LucideIcon;
}

interface SidebarProps {
  navItems: NavItem[];
  activeHref: string;
  userName: string;
  userRole: string;
  userInitials: string;
  className?: string;
}

export function Sidebar({
  navItems,
  activeHref,
  userName,
  userRole,
  userInitials,
  className,
}: SidebarProps) {
  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col justify-between border-r border-border bg-surface",
        className
      )}
    >
      <div>
        <div className="flex items-center border-b border-border px-5 py-5">
          <Logo />
        </div>

        <nav className="flex flex-col gap-0.5 p-3">
          {navItems.map((item) => {
            const isActive = item.href === activeHref;
            const Icon = item.icon;

            if (!item.enabled) {
              return (
                <span
                  key={item.label}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium text-text-subtle"
                  aria-disabled="true"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon size={17} strokeWidth={1.75} />
                    {item.label}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-text-subtle">
                    Soon
                  </span>
                </span>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150",
                  isActive
                    ? "bg-navy-950 text-white"
                    : "text-text-muted hover:bg-surface-sunken hover:text-text"
                )}
              >
                <Icon size={17} strokeWidth={1.75} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-navy-950 text-xs font-semibold text-white">
            {userInitials}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text">
              {userName}
            </p>
            <p className="truncate text-xs text-text-subtle">{userRole}</p>
          </div>
        </div>
        <Link
          href="/"
          className="mt-4 flex items-center justify-center gap-2 rounded-md border border-border-strong px-3 py-2 text-center text-sm font-medium text-text-muted transition-colors hover:bg-surface-sunken"
        >
          <LogOut size={16} strokeWidth={1.75} />
          Log out
        </Link>
      </div>
    </aside>
  );
}
