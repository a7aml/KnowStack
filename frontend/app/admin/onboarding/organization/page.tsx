"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2 } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { FullPageLoader } from "@/components/ui/FullPageLoader";
import { ApiError, getOnboardingStatus, submitOnboarding } from "@/lib/apiClient";
import { isRequiredWithMax, NAME_MAX_LENGTH } from "@/lib/validation";

const MAX_LOGO_BYTES = 500 * 1024;

export default function OnboardingOrganizationPage() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const [email, setEmail] = useState<string | null>(null);

  const [orgName, setOrgName] = useState("");
  const [orgNameTouched, setOrgNameTouched] = useState(false);
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // This page must never trust a frontend-only "am I authenticated" check
    // — it asks the backend, which verifies the onboarding_token cookie
    // server-side and independently confirms there's still no users row for
    // this Google identity (not just that a token exists).
    async function checkStatus() {
      try {
        const onboardingStatus = await getOnboardingStatus();
        if (cancelled) return;
        if (!onboardingStatus.needs_onboarding) {
          // Already has an account (e.g. completed onboarding in another
          // tab) — nothing to do here. Send them to sign in normally rather
          // than minting a session from what should be a read-only check.
          router.replace("/admin/login");
          return;
        }
        setEmail(onboardingStatus.email);
        setIsChecking(false);
      } catch {
        // No valid onboarding session — missing/expired token, or this
        // page was reached without ever going through Google.
        if (!cancelled) router.replace("/admin/login");
      }
    }

    checkStatus();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const orgNameError = !orgName.trim()
    ? "Organization name is required"
    : !isRequiredWithMax(orgName)
      ? `Must be ${NAME_MAX_LENGTH} characters or fewer`
      : null;

  const isFormValid = !orgNameError && !logoError;

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setLogoError(null);
    setLogoDataUrl(null);
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
      setLogoDataUrl(typeof reader.result === "string" ? reader.result : null);
    };
    reader.onerror = () => {
      setLogoError("Could not read that file — try a different image");
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setOrgNameTouched(true);
    setSubmitError(null);
    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      await submitOnboarding({
        organization_name: orgName,
        logo_url: logoDataUrl,
      });
      router.push("/admin/dashboard");
    } catch (err) {
      setSubmitError(
        err instanceof ApiError ? err.message : "Something went wrong. Please try again."
      );
      setIsSubmitting(false);
    }
  }

  if (isChecking) {
    return <FullPageLoader />;
  }

  return (
    <AuthShell
      eyebrow="Admin console"
      title="Set up your organization"
      subtitle={
        email
          ? `Signed in as ${email}. One more step to finish setting up your workspace.`
          : "One more step to finish setting up your workspace."
      }
      panelHeading="You're almost in."
      panelBody="Since this is your first time signing in with Google, we just need your organization's name to finish setting up your admin workspace."
      panelPoints={[
        "You'll be the first administrator",
        "Invite your team once you're in",
        "Full administrative control",
      ]}
      footer={null}
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Input
          label="Organization name"
          type="text"
          name="orgName"
          placeholder="Acme Industries"
          maxLength={NAME_MAX_LENGTH}
          required
          icon={<Building2 size={16} strokeWidth={1.75} />}
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          onBlur={() => setOrgNameTouched(true)}
          error={orgNameTouched ? (orgNameError ?? undefined) : undefined}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="logo" className="text-sm font-medium text-text">
            Logo <span className="font-normal text-text-subtle">(optional)</span>
          </label>
          <input
            id="logo"
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
            className="text-sm text-text-muted file:mr-3 file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-text hover:file:bg-surface-sunken"
          />
          {logoError ? (
            <p className="text-xs text-danger">{logoError}</p>
          ) : (
            <p className="text-xs text-text-muted">PNG or JPG, up to 500KB.</p>
          )}
        </div>

        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}

        <Button type="submit" fullWidth disabled={!isFormValid || isSubmitting}>
          {isSubmitting ? "Creating organization…" : "Create organization"}
        </Button>
      </form>
    </AuthShell>
  );
}
