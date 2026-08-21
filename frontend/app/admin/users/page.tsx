"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Mail,
  Power,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  Users as UsersIcon,
  XCircle,
} from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { Toast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonTable } from "@/components/ui/Skeleton";
import { FullPageLoader } from "@/components/ui/FullPageLoader";
import { Table, TableHeadRow, Th, Td, Tr } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { adminNavItems } from "@/lib/mock-data";
import {
  ApiError,
  getCurrentUser,
  refreshSession,
  inviteEmployee,
  listInvites,
  resendInvite,
  revokeInvite,
  listUsers,
  updateUserStatus,
  deleteUser,
  type AuthUser,
  type InvitePublic,
  type EmployeeUserPublic,
} from "@/lib/apiClient";
import { isValidEmail } from "@/lib/validation";

const USERS_PAGE_SIZE = 10;

function initialsFor(fullName: string | null, email: string): string {
  const source = fullName?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const INVITE_STATUS_TONE: Record<InvitePublic["status"], BadgeTone> = {
  pending: "info",
  accepted: "success",
  expired: "neutral",
  revoked: "danger",
};

const USER_STATUS_TONE: Record<EmployeeUserPublic["status"], BadgeTone> = {
  invited: "info",
  active: "success",
  disabled: "warning",
  deleted: "danger",
};

export default function AdminUsersPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  // --- Invites (existing) ---
  const [invites, setInvites] = useState<InvitePublic[]>([]);
  const [isLoadingInvites, setIsLoadingInvites] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);

  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // --- Users management (new) ---
  const [users, setUsers] = useState<EmployeeUserPublic[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [usersPage, setUsersPage] = useState(1);
  const [usersStatusFilter, setUsersStatusFilter] = useState<"" | "active" | "disabled">("");
  const [usersSearchInput, setUsersSearchInput] = useState("");
  const [usersSearchDebounced, setUsersSearchDebounced] = useState("");
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);
  const [usersListError, setUsersListError] = useState<string | null>(null);

  const [pendingUserActionId, setPendingUserActionId] = useState<string | null>(null);
  const [userActionError, setUserActionError] = useState<string | null>(null);

  const [detailUser, setDetailUser] = useState<EmployeeUserPublic | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmployeeUserPublic | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

      if (!currentUser) {
        router.replace("/admin/login");
        return;
      }
      if (currentUser.role !== "admin") {
        // An employee session somehow landed on an admin-only page — this
        // endpoint's actual data calls are already blocked server-side by
        // require_admin, but there's no reason to render the form for them.
        router.replace("/login");
        return;
      }
      setUser(currentUser);
      setIsChecking(false);
      await loadInvites();
    }

    verifySession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function loadInvites() {
    setIsLoadingInvites(true);
    setListError(null);
    try {
      const { invites: fetched } = await listInvites();
      setInvites(fetched);
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : "Could not load invites.");
    } finally {
      setIsLoadingInvites(false);
    }
  }

  async function loadUsers() {
    setIsLoadingUsers(true);
    setUsersListError(null);
    try {
      const result = await listUsers({
        status: usersStatusFilter || undefined,
        search: usersSearchDebounced || undefined,
        page: usersPage,
        pageSize: USERS_PAGE_SIZE,
      });
      setUsers(result.users);
      setTotalUsers(result.total);
    } catch (err) {
      setUsersListError(err instanceof ApiError ? err.message : "Could not load users.");
    } finally {
      setIsLoadingUsers(false);
    }
  }

  // Debounce the raw search input before it drives a request.
  useEffect(() => {
    const handle = setTimeout(() => setUsersSearchDebounced(usersSearchInput.trim()), 400);
    return () => clearTimeout(handle);
  }, [usersSearchInput]);

  // Refetch whenever the session is ready or a filter/page changes. Wrapped
  // one level deep (trigger -> loadUsers) so the effect body itself never
  // calls a function whose first statement is a state update, same shape as
  // the session-check effect above.
  useEffect(() => {
    if (isChecking) return;
    let cancelled = false;
    async function trigger() {
      if (!cancelled) await loadUsers();
    }
    trigger();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isChecking, usersPage, usersStatusFilter, usersSearchDebounced]);

  const emailError =
    email.trim() && !isValidEmail(email) ? "Enter a valid email address" : null;
  const canSubmitInvite = email.trim().length > 0 && !emailError;

  async function handleInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    if (!canSubmitInvite) return;

    setIsInviting(true);
    try {
      const { message } = await inviteEmployee(email.trim());
      setInviteSuccess(message);
      setEmail("");
      await loadInvites();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsInviting(false);
    }
  }

  async function handleResend(inviteId: string) {
    setActionError(null);
    setPendingActionId(inviteId);
    try {
      await resendInvite(inviteId);
      await loadInvites();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not resend invite.");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleRevoke(inviteId: string) {
    setActionError(null);
    setPendingActionId(inviteId);
    try {
      await revokeInvite(inviteId);
      await loadInvites();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Could not revoke invite.");
    } finally {
      setPendingActionId(null);
    }
  }

  function handleStatusFilterChange(value: string) {
    setUsersStatusFilter(value as "" | "active" | "disabled");
    setUsersPage(1);
  }

  function handleSearchInputChange(value: string) {
    setUsersSearchInput(value);
    setUsersPage(1);
  }

  async function handleToggleStatus(target: EmployeeUserPublic) {
    setUserActionError(null);
    setPendingUserActionId(target.id);
    const nextStatus = target.status === "active" ? "disabled" : "active";
    try {
      await updateUserStatus(target.id, nextStatus);
      await loadUsers();
    } catch (err) {
      setUserActionError(err instanceof ApiError ? err.message : "Could not update user status.");
    } finally {
      setPendingUserActionId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      await loadUsers();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Could not delete user.");
    } finally {
      setIsDeleting(false);
    }
  }

  if (isChecking || !user) {
    return <FullPageLoader />;
  }

  const displayName = user.full_name || user.email;
  const totalPages = Math.max(1, Math.ceil(totalUsers / USERS_PAGE_SIZE));

  return (
    <DashboardShell
      navItems={adminNavItems}
      activeHref="/admin/users"
      pageTitle="Users"
      userName={displayName}
      userRole={user.role === "admin" ? "Workspace Admin" : "Employee"}
      userInitials={initialsFor(user.full_name, user.email)}
    >
      <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
        <Card padding="md">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-navy-950">
            <UserPlus size={18} strokeWidth={1.75} className="text-text-subtle" />
            Invite an employee
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Invites are sent one at a time and expire after 3 days if not accepted.
          </p>

          <form onSubmit={handleInviteSubmit} noValidate className="mt-4 flex items-start gap-3">
            <div className="flex-1">
              <Input
                label="Work email"
                type="email"
                name="inviteEmail"
                placeholder="employee@company.com"
                icon={<Mail size={16} strokeWidth={1.75} />}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                error={emailError ?? undefined}
              />
            </div>
            <div className="pt-7">
              <Button type="submit" disabled={!canSubmitInvite || isInviting}>
                {isInviting ? "Sending…" : "Send invite"}
              </Button>
            </div>
          </form>

          {inviteError ? (
            <div className="mt-4">
              <Alert tone="danger">{inviteError}</Alert>
            </div>
          ) : null}
          {inviteSuccess ? (
            <div className="mt-4">
              <Alert tone="success">{inviteSuccess}</Alert>
            </div>
          ) : null}
        </Card>

        <Card padding="lg">
          <h2 className="text-lg font-semibold text-navy-950">Invites</h2>

          {actionError ? (
            <div className="mt-3">
              <Alert tone="danger">{actionError}</Alert>
            </div>
          ) : null}

          {isLoadingInvites ? (
            <div className="mt-4">
              <SkeletonTable rows={4} columns={5} />
            </div>
          ) : listError ? (
            <div className="mt-4">
              <Alert tone="danger">{listError}</Alert>
            </div>
          ) : invites.length === 0 ? (
            <EmptyState icon={Mail} title="No invites yet" />
          ) : (
            <div className="mt-4">
              <Table>
                <thead>
                  <TableHeadRow>
                    <Th>Email</Th>
                    <Th className="w-28">Status</Th>
                    <Th className="w-32">Invited</Th>
                    <Th className="w-32">Expires</Th>
                    <Th className="w-48">Actions</Th>
                  </TableHeadRow>
                </thead>
                <tbody>
                  {invites.map((invite) => {
                    const isBusy = pendingActionId === invite.id;
                    const canResend = invite.status === "pending" || invite.status === "expired";
                    const canRevoke = invite.status === "pending";
                    return (
                      <Tr key={invite.id}>
                        <Td className="text-text">{invite.email}</Td>
                        <Td>
                          <Badge tone={INVITE_STATUS_TONE[invite.status]}>{invite.status}</Badge>
                        </Td>
                        <Td className="text-text-muted">{formatDate(invite.created_at)}</Td>
                        <Td className="text-text-muted">{formatDate(invite.expires_at)}</Td>
                        <Td>
                          <div className="flex gap-2">
                            {canResend ? (
                              <Button
                                variant="secondary"
                                size="sm"
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleResend(invite.id)}
                              >
                                <RotateCcw size={13} strokeWidth={1.75} />
                                {isBusy ? "…" : "Resend"}
                              </Button>
                            ) : null}
                            {canRevoke ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                type="button"
                                disabled={isBusy}
                                onClick={() => handleRevoke(invite.id)}
                              >
                                <XCircle size={13} strokeWidth={1.75} />
                                {isBusy ? "…" : "Revoke"}
                              </Button>
                            ) : null}
                          </div>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </div>
          )}
        </Card>

        <Card padding="lg">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-semibold text-navy-950">
                <UsersIcon size={18} strokeWidth={1.75} className="text-text-subtle" />
                All users
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Everyone in {user.organization_name ?? "your organization"} — admins and employees.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-56">
                <Input
                  label="Search"
                  type="search"
                  name="userSearch"
                  placeholder="Name or email"
                  icon={<Search size={16} strokeWidth={1.75} />}
                  value={usersSearchInput}
                  onChange={(e) => handleSearchInputChange(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="statusFilter" className="text-sm font-medium text-text">
                  Status
                </label>
                <select
                  id="statusFilter"
                  value={usersStatusFilter}
                  onChange={(e) => handleStatusFilterChange(e.target.value)}
                  className="rounded-md border border-border-strong bg-surface px-3 py-2.5 text-sm text-text transition-[border-color,box-shadow] duration-150 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
            </div>
          </div>

          {userActionError ? (
            <div className="mt-4">
              <Alert tone="danger">{userActionError}</Alert>
            </div>
          ) : null}

          {isLoadingUsers ? (
            <div className="mt-4">
              <SkeletonTable rows={5} columns={6} />
            </div>
          ) : usersListError ? (
            <div className="mt-4">
              <Alert tone="danger">{usersListError}</Alert>
            </div>
          ) : users.length === 0 ? (
            <EmptyState icon={UsersIcon} title="No users match your filters" />
          ) : (
            <>
              <div className="mt-4">
                <Table minWidth="640px">
                  <thead>
                    <TableHeadRow>
                      <Th className="w-1/4">Name</Th>
                      <Th className="w-1/4">Email</Th>
                      <Th className="w-24">Role</Th>
                      <Th className="w-28">Status</Th>
                      <Th className="w-28">Joined</Th>
                      <Th className="w-56">Actions</Th>
                    </TableHeadRow>
                  </thead>
                  <tbody>
                    {users.map((row) => {
                      const isSelf = row.id === user.id;
                      const isBusy = pendingUserActionId === row.id;
                      const canToggle = row.status === "active" || row.status === "disabled";
                      const canDelete = row.status !== "deleted";
                      return (
                        <Tr key={row.id}>
                          <Td className="text-text">{row.full_name || "—"}</Td>
                          <Td className="text-text-muted">{row.email}</Td>
                          <Td className="text-text-muted capitalize">{row.role}</Td>
                          <Td>
                            <Badge tone={USER_STATUS_TONE[row.status]}>{row.status}</Badge>
                          </Td>
                          <Td className="text-text-muted">{formatDate(row.created_at)}</Td>
                          <Td>
                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                type="button"
                                onClick={() => setDetailUser(row)}
                              >
                                <Eye size={13} strokeWidth={1.75} />
                                View
                              </Button>
                              {!isSelf && canToggle ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => handleToggleStatus(row)}
                                >
                                  <Power size={13} strokeWidth={1.75} />
                                  {isBusy ? "…" : row.status === "active" ? "Disable" : "Enable"}
                                </Button>
                              ) : null}
                              {!isSelf && canDelete ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => {
                                    setDeleteError(null);
                                    setDeleteTarget(row);
                                  }}
                                >
                                  <Trash2 size={13} strokeWidth={1.75} />
                                  Delete
                                </Button>
                              ) : null}
                            </div>
                          </Td>
                        </Tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-text-muted">
                  Showing {users.length} of {totalUsers}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    disabled={usersPage <= 1}
                    onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft size={14} strokeWidth={1.75} />
                    Previous
                  </Button>
                  <span className="text-xs text-text-muted">
                    Page {usersPage} of {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    type="button"
                    disabled={usersPage >= totalPages}
                    onClick={() => setUsersPage((p) => Math.min(totalPages, p + 1))}
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

      <Modal
        open={detailUser !== null}
        onClose={() => setDetailUser(null)}
        title="User details"
        footer={
          <Button variant="secondary" type="button" onClick={() => setDetailUser(null)}>
            Close
          </Button>
        }
      >
        {detailUser ? (
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Name</dt>
              <dd className="text-right font-medium text-text">{detailUser.full_name || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Email</dt>
              <dd className="text-right font-medium text-text">{detailUser.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Role</dt>
              <dd className="text-right font-medium capitalize text-text">{detailUser.role}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Status</dt>
              <dd className="text-right">
                <Badge tone={USER_STATUS_TONE[detailUser.status]}>{detailUser.status}</Badge>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Joined</dt>
              <dd className="text-right font-medium text-text">{formatDate(detailUser.created_at)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-text-muted">Invited by</dt>
              <dd className="text-right font-medium text-text">{detailUser.invited_by_name || "—"}</dd>
            </div>
          </dl>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete user"
        message={`This will permanently remove ${deleteTarget?.email ?? "this user"}, are you sure?`}
        confirmLabel="Delete"
        isConfirming={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
      />
      <Toast message={deleteError} tone="danger" onDismiss={() => setDeleteError(null)} />
    </DashboardShell>
  );
}
