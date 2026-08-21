"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastTone = "danger" | "success";

interface ToastProps {
  message: string | null;
  tone?: ToastTone;
  onDismiss: () => void;
  autoDismissMs?: number;
}

const toneClasses: Record<ToastTone, string> = {
  danger: "border-danger-bg bg-surface text-danger",
  success: "border-success-bg bg-surface text-success",
};

const toneIcon: Record<ToastTone, typeof AlertCircle> = {
  danger: AlertCircle,
  success: CheckCircle2,
};

const EXIT_ANIMATION_MS = 150;

export function Toast({ message, tone = "danger", onDismiss, autoDismissMs = 6000 }: ToastProps) {
  const [rendered, setRendered] = useState(message !== null);
  const [closing, setClosing] = useState(false);
  const [displayMessage, setDisplayMessage] = useState(message);
  const [prevMessage, setPrevMessage] = useState(message);

  // Derive rendered/closing/displayMessage from a change in `message`
  // during render (rather than in an effect) so the transition starts on
  // the same commit the prop changes, per
  // https://react.dev/learn/you-might-not-need-an-effect.
  if (message !== prevMessage) {
    setPrevMessage(message);
    if (message !== null) {
      setDisplayMessage(message);
      setRendered(true);
      setClosing(false);
    } else if (rendered) {
      setClosing(true);
    }
  }

  useEffect(() => {
    if (!closing) return;
    const timeout = setTimeout(() => setRendered(false), EXIT_ANIMATION_MS);
    return () => clearTimeout(timeout);
  }, [closing]);

  useEffect(() => {
    if (message === null || autoDismissMs === 0) return;
    const timeout = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timeout);
  }, [message, autoDismissMs, onDismiss]);

  if (!rendered) return null;

  const Icon = toneIcon[tone];

  return (
    <div
      role="alert"
      className={cn(
        "fixed bottom-6 left-1/2 z-50 flex max-w-md items-start gap-2.5 rounded-md border px-4 py-3 text-sm shadow-lg",
        toneClasses[tone],
        closing ? "animate-toast-out" : "animate-toast-in"
      )}
    >
      <Icon size={16} strokeWidth={1.75} className="mt-0.5 shrink-0" />
      <span className="flex-1">{displayMessage}</span>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={onDismiss}
        className="shrink-0 text-text-subtle transition-colors hover:text-text"
      >
        <X size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
}
