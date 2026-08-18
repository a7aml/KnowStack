"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import { ApiError, GOOGLE_LOGIN_URL, signupAdmin } from "@/lib/apiClient";
import { isPasswordValid, isRequiredWithMax, isValidEmail, NAME_MAX_LENGTH } from "@/lib/validation";

type Field = "fullName" | "orgName" | "email" | "password" | "confirmPassword";

// Same button as the login page, same OAuth flow — the backend callback
// decides whether this is a returning user (logs them straight in) or a
// first-time Google user (sends them to /admin/onboarding/organization),
// so signup and login don't need distinct Google entry points.
function GoogleButton() {
  return (
    <a
      href={GOOGLE_LOGIN_URL}
      className="flex w-full items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-4 py-2.5 text-sm font-medium text-text transition-colors hover:bg-surface-sunken"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62z"
        />
        <path
          fill="#34A853"
          d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.85.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
        />
        <path
          fill="#FBBC05"
          d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z"
        />
        <path
          fill="#EA4335"
          d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
        />
      </svg>
      Continue with Google
    </a>
  );
}

export default function AdminSignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function markTouched(field: Field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  const fullNameError = !fullName.trim()
    ? "Full name is required"
    : !isRequiredWithMax(fullName)
      ? `Must be ${NAME_MAX_LENGTH} characters or fewer`
      : null;

  const orgNameError = !orgName.trim()
    ? "Organization name is required"
    : !isRequiredWithMax(orgName)
      ? `Must be ${NAME_MAX_LENGTH} characters or fewer`
      : null;

  const emailError = !email.trim()
    ? "Work email is required"
    : !isValidEmail(email)
      ? "Enter a valid email address"
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

  const isFormValid =
    !fullNameError && !orgNameError && !emailError && !passwordError && !confirmPasswordError;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({
      fullName: true,
      orgName: true,
      email: true,
      password: true,
      confirmPassword: true,
    });
    setSubmitError(null);

    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      await signupAdmin({
        email,
        password,
        confirm_password: confirmPassword,
        full_name: fullName,
        organization_name: orgName,
      });
      // Signup never logs the user in — the backend issues no session
      // cookies on this call, so we redirect to /admin/login instead of the
      // dashboard. The `signup=success` param is read there (via
      // window.location, not useSearchParams, to avoid a Suspense boundary)
      // to show a one-time "Account created" message.
      router.push("/admin/login?signup=success");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Admin console"
      title="Create your organization"
      subtitle="Set up a new workspace and become its first administrator."
      panelHeading="Get your organization's knowledge base running in minutes."
      panelBody="As the first admin, you'll invite your team and connect your documents once your workspace is ready."
      panelPoints={[
        "Dedicated, isolated workspace",
        "Invite unlimited employees",
        "Full administrative control",
      ]}
      footer={
        <>
          Already have an admin account?{" "}
          <Link href="/admin/login" className="font-medium text-accent hover:text-accent-hover">
            Sign in
          </Link>
        </>
      }
    >
      <GoogleButton />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-text-subtle">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Input
          label="Full name"
          type="text"
          name="fullName"
          autoComplete="name"
          placeholder="Jordan Reyes"
          maxLength={NAME_MAX_LENGTH}
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          onBlur={() => markTouched("fullName")}
          error={touched.fullName ? (fullNameError ?? undefined) : undefined}
        />
        <Input
          label="Organization name"
          type="text"
          name="orgName"
          placeholder="Acme Industries"
          maxLength={NAME_MAX_LENGTH}
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
          onBlur={() => markTouched("orgName")}
          error={touched.orgName ? (orgNameError ?? undefined) : undefined}
        />
        <Input
          label="Work email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => markTouched("email")}
          error={touched.email ? (emailError ?? undefined) : undefined}
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
          {isSubmitting ? "Creating account…" : "Create admin account"}
        </Button>
      </form>
    </AuthShell>
  );
}
