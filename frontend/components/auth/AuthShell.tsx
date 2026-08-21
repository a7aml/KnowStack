import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import { Logo } from "@/components/ui/Logo";

interface AuthShellProps {
  eyebrow: string;
  title: string;
  subtitle: string;
  panelHeading: string;
  panelBody: string;
  panelPoints: string[];
  children: ReactNode;
  footer: ReactNode;
}

export function AuthShell({
  eyebrow,
  title,
  subtitle,
  panelHeading,
  panelBody,
  panelPoints,
  children,
  footer,
}: AuthShellProps) {
  return (
    <div className="flex min-h-screen">
      {/* Branding panel */}
      <div className="hidden w-[40%] flex-col justify-between bg-navy-950 px-10 py-10 lg:flex">
        <Link href="/">
          <Logo variant="light" />
        </Link>

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-navy-300">
            {eyebrow}
          </p>
          <h2 className="mt-3 max-w-sm text-2xl font-semibold leading-snug text-white">
            {panelHeading}
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-navy-200">
            {panelBody}
          </p>
          <ul className="mt-6 space-y-2.5">
            {panelPoints.map((point) => (
              <li
                key={point}
                className="flex items-start gap-2.5 text-sm text-navy-200"
              >
                <CheckCircle2 size={16} strokeWidth={1.75} className="mt-0.5 shrink-0 text-navy-400" />
                {point}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-navy-400">
          © {new Date().getFullYear()} KnowStack
        </p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-20">
        <div className="mx-auto w-full max-w-sm animate-fade-in-up">
          <Link href="/" className="lg:hidden">
            <Logo />
          </Link>

          <div className="mt-8 lg:mt-0">
            <h1 className="text-2xl font-semibold tracking-tight text-navy-950">
              {title}
            </h1>
            <p className="mt-2 text-sm text-text-muted">{subtitle}</p>
          </div>

          <div className="mt-8">{children}</div>

          <div className="mt-6 text-sm text-text-muted">{footer}</div>
        </div>
      </div>
    </div>
  );
}
