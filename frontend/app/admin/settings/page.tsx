"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { adminNavItems } from "@/lib/mock-data";
import {
  ApiError,
  getCurrentUser,
  refreshSession,
  getOrganization,
  updateOrganization,
  type AuthUser,
  type OrganizationPublic,
} from "@/lib/apiClient";
import { isRequiredWithMax, NAME_MAX_LENGTH } from "@/lib/validation";

// Same cap as the onboarding organization-creation page
// (frontend/app/admin/onboarding/organization/page.tsx) — kept as a
// separate constant here rather than importing from that page, since it
// isn't a shared exported helper and that file is out of scope for this
// change.
const MAX_LOGO_BYTES = 500 * 1024;

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
    month: "long",
    day: "numeric",
  });
}

export default function OrganizationSettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isChecking, setIsChecking] = useState(true);

  const [org, setOrg] = useState<OrganizationPublic | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pendingLogoDataUrl, setPendingLogoDataUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  async function loadOrganization() {
    setIsLoadingOrg(true);
    setLoadError(null);
    try {
      const fetched = await getOrganization();
      setOrg(fetched);
      setName(fetched.name);
      setLogoPreview(fetched.logo_url);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not load organization settings.");
    } finally {
      setIsLoadingOrg(false);
    }
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

      if (!currentUser) {
        router.replace("/admin/login");
        return;
      }
      if (currentUser.role !== "admin") {
        // Organization settings' actual data calls are already blocked
        // server-side by require_admin, but there's no reason to render
        // this page for an employee session.
        router.replace("/login");
        return;
      }
      setUser(currentUser);
      setIsChecking(false);
      await loadOrganization();
    }

    verifySession();
    return () => {
      cancelled = true;
    };
  }, [router]);

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setLogoError(null);
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setLogoError("Logo must be an image file");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("Logo must be 500KB or smaller");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      setPendingLogoDataUrl(dataUrl);
      setLogoPreview(dataUrl);
    };
    reader.onerror = () => {
      setLogoError("Could not read that file — try a different image");
    };
    reader.readAsDataURL(file);
  }

  const nameError = !name.trim()
    ? "Organization name is required"
    : !isRequiredWithMax(name)
      ? `Must be ${NAME_MAX_LENGTH} characters or fewer`
      : null;

  const hasChanges = org !== null && (name.trim() !== org.name || pendingLogoDataUrl !== null);
  const canSave = hasChanges && !nameError && !logoError;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNameTouched(true);
    setSaveError(null);
    setSaveSuccess(null);
    if (!canSave || !org) return;

    const payload: { name?: string; logo_url?: string } = {};
    if (name.trim() !== org.name) payload.name = name.trim();
    if (pendingLogoDataUrl) payload.logo_url = pendingLogoDataUrl;

    setIsSaving(true);
    try {
      const { organization, message } = await updateOrganization(payload);
      setOrg(organization);
      setName(organization.name);
      setLogoPreview(organization.logo_url);
      setPendingLogoDataUrl(null);
      setSaveSuccess(message);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  if (isChecking || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <p className="text-sm text-text-muted">Checking your session…</p>
      </div>
    );
  }

  const displayName = user.full_name || user.email;

  return (
    <DashboardShell
      navItems={adminNavItems}
      activeHref="/admin/settings"
      pageTitle="Organization Settings"
      userName={displayName}
      userRole={user.role === "admin" ? "Workspace Admin" : "Employee"}
      userInitials={initialsFor(user.full_name, user.email)}
    >
      <div className="mx-auto max-w-2xl">
        <Card padding="lg">
          <h2 className="text-lg font-semibold text-navy-950">Organization Settings</h2>
          <p className="mt-1 text-sm text-text-muted">
            Update your organization&apos;s name and logo.
          </p>

          {isLoadingOrg ? (
            <p className="mt-6 text-sm text-text-muted">Loading…</p>
          ) : loadError ? (
            <p className="mt-6 rounded-md border border-danger-bg bg-danger-bg px-3 py-2 text-sm text-danger">
              {loadError}
            </p>
          ) : org ? (
            <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-col gap-5">
              <Input
                label="Organization name"
                type="text"
                name="orgName"
                maxLength={NAME_MAX_LENGTH}
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => setNameTouched(true)}
                error={nameTouched ? (nameError ?? undefined) : undefined}
              />

              <div className="flex flex-col gap-1.5">
                <label htmlFor="logo" className="text-sm font-medium text-text">
                  Logo <span className="font-normal text-text-subtle">(optional)</span>
                </label>
                <div className="flex items-center gap-4">
                  {logoPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data: URL, not an optimizable remote asset
                    <img
                      src={logoPreview}
                      alt="Organization logo"
                      className="h-14 w-14 rounded-md border border-border object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-border text-xs text-text-subtle">
                      No logo
                    </div>
                  )}
                  <input
                    id="logo"
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    className="text-sm text-text-muted file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text hover:file:bg-surface-sunken"
                  />
                </div>
                {logoError ? (
                  <p className="text-xs text-danger">{logoError}</p>
                ) : (
                  <p className="text-xs text-text-muted">PNG or JPG, up to 500KB.</p>
                )}
              </div>

              <div className="flex justify-between gap-4 border-t border-border pt-4 text-sm">
                <span className="text-text-muted">Organization created</span>
                <span className="font-medium text-text">{formatDate(org.created_at)}</span>
              </div>

              {saveError ? (
                <p className="rounded-md border border-danger-bg bg-danger-bg px-3 py-2 text-sm text-danger">
                  {saveError}
                </p>
              ) : null}
              {saveSuccess ? (
                <p className="rounded-md border border-success-bg bg-success-bg px-3 py-2 text-sm text-success">
                  {saveSuccess}
                </p>
              ) : null}

              <Button type="submit" disabled={!canSave || isSaving}>
                {isSaving ? "Saving…" : "Save changes"}
              </Button>
            </form>
          ) : null}
        </Card>
      </div>
    </DashboardShell>
  );
}
