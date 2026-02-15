/**
 * Reusable dismissible toast notification component.
 *
 * Renders a fixed bottom-right toast with an optional close button.
 * Supports "default" and "error" variants.
 *
 * Usage:
 *   const [toast, setToast] = useToast();
 *   setToast({ message: "Something happened" });
 *   setToast({ message: "It failed", variant: "error" });
 *   setToast(null); // dismiss
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ToastState {
  message: string;
  variant?: "default" | "error";
}

/**
 * Hook for managing a single toast notification.
 * Returns [toastState, showToast] where showToast accepts a message + optional
 * variant and auto-dismisses after `durationMs` (default 3000ms).
 * Pass null to dismiss immediately.
 */
export function useToast(durationMs = 3000): [
  ToastState | null,
  (toast: ToastState | null) => void
] {
  const [toast, setToastState] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (next: ToastState | null) => {
      // Clear any pending auto-dismiss timer.
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setToastState(next);
      if (next !== null) {
        timerRef.current = setTimeout(() => {
          setToastState(null);
          timerRef.current = null;
        }, durationMs);
      }
    },
    [durationMs]
  );

  // Clean up on unmount.
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    []
  );

  return [toast, showToast];
}

interface ToastProps {
  toast: ToastState | null;
  onDismiss: () => void;
}

/**
 * Renders the toast notification if `toast` is non-null.
 * Fixed position bottom-right, dismissible via × button.
 */
export function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) return null;

  const isError = toast.variant === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="toast"
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-md border px-4 py-2 text-sm shadow-lg ${
        isError
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : "bg-background text-foreground"
      }`}
    >
      <span>{toast.message}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="shrink-0 opacity-60 hover:opacity-100 transition-opacity focus:outline-none focus:ring-1 focus:ring-ring rounded"
      >
        ×
      </button>
    </div>
  );
}
