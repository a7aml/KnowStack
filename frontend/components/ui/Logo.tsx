import { cn } from "@/lib/utils";

interface LogoProps {
  variant?: "dark" | "light";
  className?: string;
}

export function Logo({ variant = "dark", className }: LogoProps) {
  const isLight = variant === "light";

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <rect
          x="2"
          y="4"
          width="20"
          height="4"
          rx="1"
          fill={isLight ? "#ffffff" : "#16213a"}
        />
        <rect
          x="2"
          y="10"
          width="20"
          height="4"
          rx="1"
          fill={isLight ? "#ffffff" : "#16213a"}
          opacity="0.7"
        />
        <rect
          x="2"
          y="16"
          width="20"
          height="4"
          rx="1"
          fill={isLight ? "#ffffff" : "#16213a"}
          opacity="0.45"
        />
      </svg>
      <span
        className={cn(
          "text-base font-semibold tracking-tight",
          isLight ? "text-white" : "text-navy-950"
        )}
      >
        KnowStack
      </span>
    </div>
  );
}
