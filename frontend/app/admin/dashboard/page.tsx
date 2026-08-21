"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  LogOut,
  Mail,
  MessageSquare,
  ScrollText,
  Users,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { FullPageLoader } from "@/components/ui/FullPageLoader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonTable } from "@/components/ui/Skeleton";
import { Table, TableHeadRow, Th, Td, Tr } from "@/components/ui/Table";
import { adminNavItems } from "@/lib/mock-data";
import {
  ApiError,
  getCurrentUser,
  getDashboardActivity,
  getDashboardStats,
  listDashboardLogs,
  logout,
  refreshSession,
  type ActivityPoint,
  type ActivityRange,
  type AuthUser,
  type DashboardStats,
  type LogEntryPublic,
} from "@/lib/apiClient";

const LOGS_PAGE_SIZE = 10;

const ACTION_FILTER_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "invite_created", label: "Invite sent" },
  { value: "invite_resent", label: "Invite resent" },
  { value: "invite_revoked", label: "Invite revoked" },
  { value: "user_enabled", label: "User enabled" },
  { value: "user_disabled", label: "User disabled" },
  { value: "user_deleted", label: "User deleted" },
  { value: "organization_updated", label: "Organization updated" },
  { value: "document_uploaded", label: "Document uploaded" },
  { value: "document_deleted", label: "Document deleted" },
  { value: "chat_session_deleted", label: "Chat session deleted" },
  { value: "chat_question_asked", label: "Chat question asked" },
];

function initialsFor(fullName: string | null, email: string): string {
  const source = fullName?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function formatActionLabel(action: string): string {
  const label = action.replace(/_/g, " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function describeTarget(log: LogEntryPublic): string {
  const m = log.metadata || {};
  const str = (key: string) => (typeof m[key] === "string" ? (m[key] as string) : null);
  const shortId = (key: string, noun: string) => {
    const id = str(key);
    return id ? `${noun} ${id.slice(0, 8)}` : null;
  };
  return (
    str("target_email") ??
    str("email") ??
    str("file_name") ??
    str("new_name") ??
    shortId("document_id", "Document") ??
    shortId("session_id", "Session") ??
    shortId("invite_id", "Invite") ??
    "—"
  );
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatTile({
  label,
  value,
  subtext,
  badge,
  icon: Icon,
  isLoading,
}: {
  label: string;
  value: string;
  subtext?: string;
  badge?: ReactNode;
  icon: LucideIcon;
  isLoading?: boolean;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-navy-50 text-navy-700">
          <Icon size={16} strokeWidth={1.75} />
        </div>
        {badge}
      </div>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-text-subtle">{label}</p>
      {isLoading ? (
        <Skeleton className="mt-2 h-7 w-16" />
      ) : (
        <p className="mt-1 text-2xl font-semibold text-navy-950">{value}</p>
      )}
      {subtext ? <p className="mt-0.5 text-xs text-text-subtle">{subtext}</p> : null}
    </Card>
  );
}

function documentsSubtext(stats: DashboardStats | null): string | undefined {
  if (!stats) return undefined;
  const { processing, failed } = stats.documents;
  const parts: string[] = [];
  if (processing > 0) parts.push(`${processing} processing`);
  if (failed > 0) parts.push(`${failed} failed`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

  const [activityRange, setActivityRange] = useState<ActivityRange>("7d");
  const [activityPoints, setActivityPoints] = useState<ActivityPoint[]>([]);
  const [isLoadingActivity, setIsLoadingActivity] = useState(true);

  const [logs, setLogs] = useState<LogEntryPublic[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    setStatsError(null);
    try {
      const { stats: fetched } = await getDashboardStats();
      setStats(fetched);
    } catch (err) {
      setStatsError(err instanceof ApiError ? err.message : "Could not load stats.");
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  const loadActivity = useCallback(async (range: ActivityRange) => {
    setIsLoadingActivity(true);
    try {
      const { points } = await getDashboardActivity(range);
      setActivityPoints(points);
    } catch {
      setActivityPoints([]);
    } finally {
      setIsLoadingActivity(false);
    }
  }, []);

  const loadLogs = useCallback(async (page: number, action: string) => {
    setIsLoadingLogs(true);
    setLogsError(null);
    try {
      const result = await listDashboardLogs({
        page,
        pageSize: LOGS_PAGE_SIZE,
        action: action || undefined,
      });
      setLogs(result.logs);
      setLogsTotal(result.total);
    } catch (err) {
      setLogsError(err instanceof ApiError ? err.message : "Could not load activity logs.");
    } finally {
      setIsLoadingLogs(false);
    }
  }, []);

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
      if (currentUser) {
        await Promise.all([loadStats(), loadActivity("7d"), loadLogs(1, "")]);
      }
    }

    verifySession();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  function handleRangeChange(range: ActivityRange) {
    setActivityRange(range);
    void loadActivity(range);
  }

  function handleActionFilterChange(value: string) {
    setActionFilter(value);
    setLogsPage(1);
    void loadLogs(1, value);
  }

  function handleLogsPageChange(page: number) {
    setLogsPage(page);
    void loadLogs(page, actionFilter);
  }

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
    return <FullPageLoader />;
  }

  if (!user) {
    return null;
  }

  const displayName = user.full_name || user.email;
  const statValue = (value: number | undefined) =>
    isLoadingStats ? "…" : value !== undefined ? String(value) : "—";
  const logsTotalPages = Math.max(1, Math.ceil(logsTotal / LOGS_PAGE_SIZE));

  return (
    <DashboardShell
      navItems={adminNavItems}
      activeHref="/admin/dashboard"
      pageTitle="Dashboard"
      userName={displayName}
      userRole={user.role === "admin" ? "Workspace Admin" : "Employee"}
      userInitials={initialsFor(user.full_name, user.email)}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
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
            <LogOut size={15} strokeWidth={1.75} />
            {isLoggingOut ? "Logging out…" : "Log out"}
          </Button>
        </div>

        {statsError ? <Alert tone="danger">{statsError}</Alert> : null}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile
            label="Team members"
            value={statValue(stats?.team_members)}
            icon={Users}
            isLoading={isLoadingStats}
          />
          <StatTile
            label="Pending invites"
            value={statValue(stats?.pending_invites)}
            icon={Mail}
            isLoading={isLoadingStats}
          />
          <StatTile
            label="Documents"
            value={isLoadingStats ? "…" : stats ? `${stats.documents.ready} ready` : "—"}
            subtext={documentsSubtext(stats)}
            icon={FileText}
            isLoading={isLoadingStats}
          />
          <StatTile
            label="Chat sessions"
            value={statValue(stats?.chat_sessions)}
            icon={MessageSquare}
            isLoading={isLoadingStats}
          />
        </div>

        <ActivityChart
          points={activityPoints}
          range={activityRange}
          onRangeChange={handleRangeChange}
          isLoading={isLoadingActivity}
        />

        <Card padding="lg">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-navy-950">
              <ScrollText size={18} strokeWidth={1.75} className="text-text-subtle" />
              Activity logs
            </h2>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="actionFilter" className="sr-only">
                Filter by action
              </label>
              <select
                id="actionFilter"
                value={actionFilter}
                onChange={(e) => handleActionFilterChange(e.target.value)}
                className="rounded-md border border-border-strong bg-surface px-3 py-2.5 text-sm text-text transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
              >
                {ACTION_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {isLoadingLogs ? (
            <div className="mt-4">
              <SkeletonTable rows={6} columns={4} />
            </div>
          ) : logsError ? (
            <div className="mt-4">
              <Alert tone="danger">{logsError}</Alert>
            </div>
          ) : logs.length === 0 ? (
            <EmptyState icon={ScrollText} title="No activity recorded yet" />
          ) : (
            <>
              <div className="mt-4">
                <Table minWidth="640px">
                  <thead>
                    <TableHeadRow>
                      <Th>Action</Th>
                      <Th>Performed by</Th>
                      <Th>Target</Th>
                      <Th>When</Th>
                    </TableHeadRow>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <Tr key={log.id}>
                        <Td>
                          <Badge tone="neutral">{formatActionLabel(log.action)}</Badge>
                        </Td>
                        <Td className="text-text-muted">{log.actor_name || "—"}</Td>
                        <Td className="text-text-muted">{describeTarget(log)}</Td>
                        <Td className="text-text-muted">{formatDateTime(log.created_at)}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-text-muted">
                  Showing {logs.length} of {logsTotal}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    disabled={logsPage <= 1}
                    onClick={() => handleLogsPageChange(Math.max(1, logsPage - 1))}
                  >
                    <ChevronLeft size={14} strokeWidth={1.75} />
                    Previous
                  </Button>
                  <span className="text-xs text-text-muted">
                    Page {logsPage} of {logsTotalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    disabled={logsPage >= logsTotalPages}
                    onClick={() => handleLogsPageChange(Math.min(logsTotalPages, logsPage + 1))}
                  >
                    Next
                    <ChevronRight size={14} strokeWidth={1.75} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </DashboardShell>
  );
}
