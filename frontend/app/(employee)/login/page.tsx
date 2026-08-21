"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Lock, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { ApiError, employeeLogin } from "@/lib/apiClient";
import { isValidEmail } from "@/lib/validation";

type Field = "email" | "password";

// Same split-out-for-Suspense reasoning as the admin login page: this banner
// reads useSearchParams, which needs its own Suspense boundary, so it
// doesn't force the whole page to client-only rendering at build time.
function RedirectStatusBanner() {
  const searchParams = useSearchParams();

  if (searchParams.get("accepted") === "success") {
    return (
      <div className="mb-6">
        <Alert tone="success">Account created, please log in.</Alert>
      </div>
    );
  }

  return null;
}

export default function EmployeeLoginPage() {
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
      await employeeLogin({ email, password });
      router.push("/chat");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Employee workspace"
      title="Sign in"
      subtitle="Use the credentials provided by your organization's administrator."
      panelHeading="Ask questions. Get grounded answers."
      panelBody="Your workspace's documents are ready to search — every answer is backed by a citation to its source."
      panelPoints={[
        "Search your organization's knowledge",
        "Answers grounded in real documents",
        "Access scoped to your workspace only",
      ]}
      footer={
        <>
          New here and have an invite?{" "}
          <Link href="/signup" className="font-medium text-accent hover:text-accent-hover">
            Accept your invitation
          </Link>
        </>
      }
    >
      <Suspense fallback={null}>
        <RedirectStatusBanner />
      </Suspense>

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
        Signing in as an administrator?{" "}
        <Link href="/admin/login" className="font-medium text-accent hover:text-accent-hover">
          Go to admin sign in
        </Link>
      </p>
    </AuthShell>
  );
}
