"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function EmployeeLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/chat");
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
        Signing in as an administrator?{" "}
        <Link href="/admin/login" className="font-medium text-accent hover:text-accent-hover">
          Go to admin sign in
        </Link>
      </p>
    </AuthShell>
  );
}
