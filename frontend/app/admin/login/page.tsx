"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/admin/dashboard");
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input
          label="Work email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button type="submit" fullWidth>
          Sign in
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
