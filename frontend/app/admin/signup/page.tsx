"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function AdminSignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push("/admin/dashboard");
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
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <Input
          label="Full name"
          type="text"
          name="fullName"
          autoComplete="name"
          placeholder="Jordan Reyes"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <Input
          label="Organization name"
          type="text"
          name="orgName"
          placeholder="Acme Industries"
          required
          value={orgName}
          onChange={(e) => setOrgName(e.target.value)}
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
        <Button type="submit" fullWidth>
          Create admin account
        </Button>
      </form>
    </AuthShell>
  );
}
