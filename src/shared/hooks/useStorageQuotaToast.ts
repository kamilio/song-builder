/**
 * Listens for localStorage quota exceeded events and shows a persistent toast.
 *
 * Usage: call this hook once at the app root.  It subscribes to the
 * storageQuotaEvents bus on mount and unsubscribes on unmount.  When a write
 * fails due to QuotaExceededError the user sees:
 *
 *   "Storage full — delete old sessions or songs to continue"
 *
 * Returns the [ToastState | null, dismissToast] tuple so the caller can render
 * the <Toast> component.
 */

import { useEffect } from "react";
import { useToast, type ToastState } from "@/shared/components/Toast";
import { onQuotaExceeded, offQuotaExceeded } from "@/shared/lib/storageQuotaEvents";

const QUOTA_MESSAGE =
  "Storage full — delete old sessions or songs to continue";

export function useStorageQuotaToast(): [
  ToastState | null,
  (toast: ToastState | null) => void
] {
  const [toast, showToast] = useToast(10_000);

  useEffect(() => {
    function handleQuotaExceeded() {
      showToast({ message: QUOTA_MESSAGE, variant: "error" });
    }

    onQuotaExceeded(handleQuotaExceeded);
    return () => {
      offQuotaExceeded(handleQuotaExceeded);
    };
  }, [showToast]);

  return [toast, showToast];
}
