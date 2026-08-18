"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { adminNavItems } from "@/lib/mock-data";
import {
  getCurrentUser,
  listInvites,
  listUsers,
  logout,
  refreshSession,
  type AuthUser,
} from "@/lib/apiClient";

function initialsFor(fullName: string | null, email: string): string {
  const source = fullName?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function StatTile({
  label,
  value,
  badge,
}: {
  label: string;
  value: string;
  badge?: ReactNode;
}) {
  return (
    <Card padding="md">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">{label}</p>
        {badge}
      </div>
      <p className="mt-2 text-2xl font-semibold text-navy-950">{value}</p>
    </Card>
  );
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [teamMemberCount, setTeamMemberCount] = useState<number | null>(null);
  const [pendingInviteCount, setPendingInviteCount] = useState<number | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  async function loadStats() {
    setIsLoadingStats(true);
    const [usersResult, invitesResult] = await Promise.allSettled([
      // page_size: 1 — only the accurate `total` count is needed here, not
      // the actual rows.
      listUsers({ status: "active", pageSize: 1 }),
      listInvites(),
    ]);
    if (usersResult.status === "fulfilled") {
      setTeamMemberCount(usersResult.value.total);
    }
    if (invitesResult.status === "fulfilled") {
      setPendingInviteCount(
        invitesResult.value.invites.filter((invite) => invite.status === "pending").length
      );
    }
    setIsLoadingStats(false);
  }

  useEffect(() => {
    let cancelled = false;

    async function verifySession() {
      let currentUser: AuthUser | null = null;

      try {
        currentUser = await getCurrentUser();
      } catch {
        try {
          currentUser = (await refreshSession()).user;
        } catch {
          currentUser = null;
        }
      }

      if (cancelled) return;

      if (currentUser) {
        setUser(currentUser);
      } else {
        router.replace("/admin/login");
      }
      setIsChecking(false);
      if (currentUser) await loadStats();
    }

    verifySession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setUser(null);
      router.replace("/admin/login");
    }
  }

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <p className="text-sm text-text-muted">Checking your session…</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const displayName = user.full_name || user.email;
  const statValue = (value: number | null) =>
    isLoadingStats ? "…" : value !== null ? String(value) : "—";

  return (
    <DashboardShell
      navItems={adminNavItems}
      activeHref="/admin/dashboard"
      pageTitle="Dashboard"
      userName={displayName}
      userRole={user.role === "admin" ? "Workspace Admin" : "Employee"}
      userInitials={initialsFor(user.full_name, user.email)}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
              {user.organization_name ?? "Your organization"}
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-navy-950">
              Welcome back, {displayName.split(" ")[0]}
            </h2>
          </div>
          <Button variant="secondary" onClick={handleLogout} disabled={isLoggingOut}>
            {isLoggingOut ? "Logging out…" : "Log out"}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Team members" value={statValue(teamMemberCount)} />
          <StatTile label="Pending invites" value={statValue(pendingInviteCount)} />
          <StatTile label="Documents" value="—" badge={<Badge tone="info">Soon</Badge>} />
          <StatTile label="Chat sessions" value="—" badge={<Badge tone="info">Soon</Badge>} />
        </div>

        <Card padding="lg">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-navy-950">Activity logs</h2>
            <Badge tone="info">Soon</Badge>
          </div>
          <p className="mt-2 text-sm text-text-muted">
            A detailed log of admin actions — invites sent, users enabled, disabled, or removed,
            organization changes — will appear here. These actions are already being recorded;
            this view is on its way.
          </p>
        </Card>
      </div>
    </DashboardShell>
  );
}
