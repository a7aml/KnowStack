"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { mockOrg } from "@/lib/mock-data";

export default function EmployeeSignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/chat");
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
          You&apos;ve been invited by <span className="font-medium">{mockOrg.name}</span>
        </p>
        <p className="mt-0.5 text-xs text-text-muted">
          Invited email: sam.whitfield@acme-industries.com
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input
          label="Full name"
          type="text"
          name="fullName"
          autoComplete="name"
          placeholder="Sam Whitfield"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="••••••••"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Input
          label="Confirm password"
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="••••••••"
          required
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <Button type="submit" fullWidth>
          Accept invite &amp; create account
        </Button>
      </form>
    </AuthShell>
  );
}
