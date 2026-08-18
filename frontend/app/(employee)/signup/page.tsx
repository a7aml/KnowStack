"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { PasswordStrengthMeter } from "@/components/ui/PasswordStrengthMeter";
import { ApiError, employeeSignup } from "@/lib/apiClient";
import { isPasswordValid, isRequiredWithMax, isValidEmail, NAME_MAX_LENGTH } from "@/lib/validation";

type Field = "fullName" | "email" | "password" | "confirmPassword";

// Reached either via a direct visit (no invite token) or by a user who
// clicked through from /accept-invite without a token in the URL somehow.
// Either way, the backend re-checks for a valid pending invite for the
// entered email before creating anything — this page never trusts a
// frontend-only assumption that the visitor was actually invited.
export default function EmployeeSignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
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

  const isFormValid = !fullNameError && !emailError && !passwordError && !confirmPasswordError;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched({ fullName: true, email: true, password: true, confirmPassword: true });
    setSubmitError(null);

    if (!isFormValid) return;

    setIsSubmitting(true);
    try {
      await employeeSignup({
        email,
        password,
        confirm_password: confirmPassword,
        full_name: fullName,
      });
      router.push("/login?accepted=success");
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <AuthShell
      eyebrow="Employee workspace"
      title="Create your account"
      subtitle="You'll need a valid invitation from your organization's admin to continue."
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
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>
    </AuthShell>
  );
}
