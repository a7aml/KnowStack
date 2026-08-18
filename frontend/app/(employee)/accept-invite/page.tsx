"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import { ApiError, acceptInvite, validateInviteToken } from "@/lib/apiClient";
import { isPasswordValid, isRequiredWithMax, NAME_MAX_LENGTH } from "@/lib/validation";

type Field = "fullName" | "password" | "confirmPassword";

const INVALID_INVITE_MESSAGE = "This invite is no longer valid, ask your admin to resend it.";

function reasonToMessage(reason: string | null): string {
  switch (reason) {
    case "already_accepted":
      return "This invite has already been accepted. Please log in instead.";
    case "not_found":
    case "expired":
    case "revoked":
    default:
      return INVALID_INVITE_MESSAGE;
  }
}

function InvalidInviteCard({ message }: { message: string }) {
  return (
    <AuthShell
      eyebrow="Employee workspace"
      title="Invite not valid"
      subtitle="This invitation link can no longer be used."
      panelHeading="Ask your admin for a new invite."
      panelBody="Invite links expire after 3 days and can only be used once. Your organization's admin can resend or check the status of your invite from the Users tab."
      panelPoints={[
        "Invite links are single-use",
        "Links expire after 3 days",
        "Admins can resend from the dashboard",
      ]}
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
            Sign in
          </Link>
        </>
      }
    >
      <p className="rounded-md border border-danger-bg bg-danger-bg px-3 py-2 text-sm text-danger">
        {message}
      </p>
    </AuthShell>
  );
}

function AcceptInviteContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [isChecking, setIsChecking] = useState(true);
  const [invalidMessage, setInvalidMessage] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkToken() {
      if (!token) {
        if (!cancelled) {
          setInvalidMessage("This invite link is missing a token. Ask your admin to resend it.");
          setIsChecking(false);
        }
        return;
      }

      // Never trust the presence of a token alone — the backend re-checks
      // status/expiry server-side, both here and again at submit time.
      try {
        const result = await validateInviteToken(token);
        if (cancelled) return;
        if (!result.valid) {
          setInvalidMessage(reasonToMessage(result.reason));
        } else {
          setEmail(result.email);
          setOrganizationName(result.organization_name);
        }
      } catch {
        if (!cancelled) setInvalidMessage(INVALID_INVITE_MESSAGE);
      } finally {
        if (!cancelled) setIsChecking(false);
      }
    }

    checkToken();
    return () => {
      cancelled = true;
    };
  }, [token]);

  function markTouched(field: Field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  const fullNameError = !fullName.trim()
    ? "Full name is required"
    : !isRequiredWithMax(fullName)
      ? `Must be ${NAME_MAX_LENGTH} characters or fewer`
      : null;

  const passwordError = !password
    ? "Password is required"
    : !isPasswordValid(password)
      ? "Password does not meet the requirements below"
      : null;

  const confirmPasswordError = !confirmPassword
    ? "Please confirm your password"
    : confirmPassword !== password
      ? "Passwords do not match"
      : null;

  const isFormValid = !fullNameError && !passwordError && !confirmPasswordError;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ fullName: true, password: true, confirmPassword: true });
    setSubmitError(null);

    if (!isFormValid || !token) return;

    setIsSubmitting(true);
    try {
      await acceptInvite({
        token,
        password,
        confirm_password: confirmPassword,
        full_name: fullName,
      });
      // Do not auto-login: redirect to the employee login page with a
      // success banner, consistent with the admin signup -> login flow.
      router.push("/login?accepted=success");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-muted">
        <p className="text-sm text-text-muted">Checking your invitation…</p>
      </div>
    );
  }

  if (invalidMessage) {
    return <InvalidInviteCard message={invalidMessage} />;
  }

  return (
    <AuthShell
      eyebrow="Employee workspace"
      title="Accept your invitation"
      subtitle="Finish setting up your account to join the workspace."
      panelHeading="You've been invited to join a workspace."
      panelBody="An administrator has added you to their organization's knowledge base. Complete setup to get started."
      panelPoints={[
        "Access is limited to your invited workspace",
        "Your admin controls document visibility",
        "You can start asking questions right away",
      ]}
      footer={
        <>
          Already set up your account?{" "}
          <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
            Sign in
          </Link>
        </>
      }
    >
      <div className="mb-6 rounded-md border border-border bg-surface-sunken px-4 py-3">
        <p className="text-sm text-text">
          You&apos;ve been invited{organizationName ? ` by ${organizationName}` : ""}
        </p>
        {email ? <p className="mt-0.5 text-xs text-text-muted">Invited email: {email}</p> : null}
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Input
          label="Full name"
          type="text"
          name="fullName"
          autoComplete="name"
          placeholder="Sam Whitfield"
          maxLength={NAME_MAX_LENGTH}
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          onBlur={() => markTouched("fullName")}
          error={touched.fullName ? (fullNameError ?? undefined) : undefined}
        />
        <div className="flex flex-col gap-2">
          <Input
            label="Password"
            type="password"
            name="password"
            autoComplete="new-password"
            placeholder="••••••••"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => markTouched("password")}
            error={touched.password ? (passwordError ?? undefined) : undefined}
          />
          <PasswordStrengthMeter password={password} />
        </div>
        <Input
          label="Confirm password"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="••••••••"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onBlur={() => markTouched("confirmPassword")}
          error={touched.confirmPassword ? (confirmPasswordError ?? undefined) : undefined}
        />

        {submitError ? (
          <p className="rounded-md border border-danger-bg bg-danger-bg px-3 py-2 text-sm text-danger">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" fullWidth disabled={!isFormValid || isSubmitting}>
          {isSubmitting ? "Creating account…" : "Accept invite & create account"}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface-muted">
          <p className="text-sm text-text-muted">Loading…</p>
        </div>
      }
    >
      <AcceptInviteContent />
    </Suspense>
  );
}
