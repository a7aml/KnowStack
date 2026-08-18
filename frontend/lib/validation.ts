const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value.trim());
}

export const PASSWORD_MIN_LENGTH = 8;
export const NAME_MAX_LENGTH = 100;

export interface PasswordRequirement {
  label: string;
  met: boolean;
}

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH },
    { label: "At least 1 uppercase letter", met: /[A-Z]/.test(password) },
    { label: "At least 1 number", met: /[0-9]/.test(password) },
    { label: "At least 1 special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
}

export function isPasswordValid(password: string): boolean {
  return getPasswordRequirements(password).every((requirement) => requirement.met);
}

export type PasswordStrength = "empty" | "weak" | "medium" | "strong";

export function getPasswordStrength(password: string): PasswordStrength {
  if (!password) return "empty";
  const metCount = getPasswordRequirements(password).filter((r) => r.met).length;
  const score = metCount + (password.length >= 12 ? 1 : 0);
  if (score <= 2) return "weak";
  if (score <= 4) return "medium";
  return "strong";
}

export function isRequiredWithMax(value: string, maxLength = NAME_MAX_LENGTH): boolean {
  const trimmed = value.trim();
  return trimmed.length > 0 && trimmed.length <= maxLength;
}
