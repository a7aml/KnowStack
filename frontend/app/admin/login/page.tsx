"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ApiError, GOOGLE_LOGIN_URL, login } from "@/lib/apiClient";
import { isValidEmail } from "@/lib/validation";

type Field = "email" | "password";

// Split out so useSearchParams (which needs a Suspense boundary to avoid
// bailing out the whole page to client-only rendering at build time) only
// affects this small banner, not the form below it.
function RedirectStatusBanner() {
  const searchParams = useSearchParams();

  if (searchParams.get("signup") === "success") {
    return (
      <div className="mb-6">
        <Alert tone="success">Account created, please log in.</Alert>
      </div>
    );
  }

  if (searchParams.get("google_error") === "1") {
    return (
      <div className="mb-6">
        <Alert tone="danger">Google sign-in didn&apos;t go through. Please try again.</Alert>
      </div>
    );
  }

  return null;
}

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

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function markTouched(field: Field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
  }

  const emailError = !email.trim()
    ? "Work email is required"
    : !isValidEmail(email)
      ? "Enter a valid email address"
      : null;

  const passwordError = !password ? "Password is required" : null;

  const isFormValid = !emailError && !passwordError;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ email: true, password: true });
    setSubmitError(null);

    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      // Tokens never touch frontend JS/state — the backend sets them as
      // httpOnly cookies on this response, so there's nothing to store here.
      await login({ email, password });
      router.push("/admin/dashboard");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Admin console"
      title="Sign in to your workspace"
      subtitle="Manage users, documents, and access policy for your organization."
      panelHeading="One console for your organization's knowledge."
      panelBody="Administrators configure workspace access, upload source documents, and review activity across the tenant."
      panelPoints={[
        "Invite and manage employees",
        "Configure document access policy",
        "Review workspace activity logs",
      ]}
      footer={
        <>
          Don&apos;t have an admin account?{" "}
          <Link href="/admin/signup" className="font-medium text-accent hover:text-accent-hover">
            Create one
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <RedirectStatusBanner />
      </Suspense>

      <GoogleButton />

      <div className="my-6 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-xs uppercase tracking-wide text-text-subtle">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <Input
          label="Work email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          icon={<Mail size={16} strokeWidth={1.75} />}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => markTouched("email")}
          error={touched.email ? (emailError ?? undefined) : undefined}
        />
        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          icon={<Lock size={16} strokeWidth={1.75} />}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => markTouched("password")}
          error={touched.password ? (passwordError ?? undefined) : undefined}
        />

        {submitError ? <Alert tone="danger">{submitError}</Alert> : null}

        <Button type="submit" fullWidth disabled={!isFormValid || isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-text-muted">
        Not an admin?{" "}
        <Link href="/login" className="font-medium text-accent hover:text-accent-hover">
          Sign in as an employee
        </Link>
      </p>
    </AuthShell>
  );
}
