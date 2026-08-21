"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  enabled: boolean;
  icon: LucideIcon;
}

interface DashboardShellProps {
  navItems: NavItem[];
  activeHref: string;
  pageTitle: string;
  userName: string;
  userRole: string;
  userInitials: string;
  children: ReactNode;
}

export function DashboardShell({
  navItems,
  activeHref,
  pageTitle,
  userName,
  userRole,
  userInitials,
  children,
}: DashboardShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const sidebarProps = {
    navItems,
    activeHref,
    userName,
    userRole,
    userInitials,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">
      {/* Desktop sidebar */}
      <Sidebar {...sidebarProps} className="hidden lg:flex" />

      {/* Mobile drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="fixed inset-0 bg-navy-950/40 animate-fade-in"
            onClick={() => setMobileNavOpen(false)}
          />
          <Sidebar {...sidebarProps} className={cn("relative z-50 flex animate-slide-in-left")} />
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar
          title={pageTitle}
          onMenuClick={() => setMobileNavOpen((open) => !open)}
        />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="animate-fade-in-up">{children}</div>
        </main>
      </div>
    </div>
  );
}
