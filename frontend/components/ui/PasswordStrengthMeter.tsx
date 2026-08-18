import { cn } from "@/lib/utils";
import { getPasswordRequirements, getPasswordStrength, type PasswordStrength } from "@/lib/validation";

interface PasswordStrengthMeterProps {
  password: string;
}

const STRENGTH_LABEL: Record<Exclude<PasswordStrength, "empty">, string> = {
  weak: "Weak",
  medium: "Medium",
  strong: "Strong",
};

const STRENGTH_BAR_COLOR: Record<Exclude<PasswordStrength, "empty">, string> = {
  weak: "bg-danger",
  medium: "bg-navy-500",
  strong: "bg-success",
};

const STRENGTH_TEXT_COLOR: Record<Exclude<PasswordStrength, "empty">, string> = {
  weak: "text-danger",
  medium: "text-navy-600",
  strong: "text-success",
};

const STRENGTH_BAR_COUNT: Record<Exclude<PasswordStrength, "empty">, number> = {
  weak: 1,
  medium: 2,
  strong: 3,
};

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const strength = getPasswordStrength(password);
  const requirements = getPasswordRequirements(password);

  if (strength === "empty") return null;

  const activeBars = STRENGTH_BAR_COUNT[strength];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1.5" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <div
            key={bar}
            className={cn(
              "h-1.5 flex-1 rounded-full bg-border",
              bar <= activeBars && STRENGTH_BAR_COLOR[strength]
            )}
          />
        ))}
      </div>
      <p className={cn("text-xs font-medium", STRENGTH_TEXT_COLOR[strength])}>
        Password strength: {STRENGTH_LABEL[strength]}
      </p>
      <ul className="flex flex-col gap-1">
        {requirements.map((requirement) => (
          <li
            key={requirement.label}
            className={cn(
              "flex items-center gap-1.5 text-xs",
              requirement.met ? "text-success" : "text-text-subtle"
            )}
          >
            <span
              className={cn(
                "h-1 w-1 shrink-0 rounded-full",
                requirement.met ? "bg-success" : "bg-text-subtle"
              )}
            />
            {requirement.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
