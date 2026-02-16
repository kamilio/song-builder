import { useCallback, useRef, useState } from "react";
import { getSettings } from "@/music/lib/storage/storageService";

/**
 * Hook that provides API key guard functionality.
 *
 * Returns:
 * - `isModalOpen`: whether the API key modal should be shown
 * - `guardAction`: call this before any generation action.
 *   - If the API key is present, calls `action()` immediately and returns true.
 *   - If the API key is absent, stores `action` as a pending callback, opens
 *     the modal, and returns false. The pending action is called by the modal
 *     via `proceedWithPendingAction` after the user enters a valid key.
 * - `closeModal`: dismiss the modal without proceeding
 * - `proceedWithPendingAction`: called by the modal on successful key verification;
 *   runs and clears the stored pending action
 *
 * Behaviour is consistent whether VITE_USE_MOCK_LLM is true or false.
 */
export function useApiKeyGuard() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const guardAction = useCallback((action?: () => void): boolean => {
    const settings = getSettings();
    const hasKey = Boolean(settings?.poeApiKey);
    if (!hasKey) {
      pendingActionRef.current = action ?? null;
      setIsModalOpen(true);
      return false;
    }
    // Key is present — run the action immediately if provided.
    action?.();
    return true;
  }, []);

  const closeModal = useCallback(() => {
    pendingActionRef.current = null;
    setIsModalOpen(false);
  }, []);

  const proceedWithPendingAction = useCallback(() => {
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    setIsModalOpen(false);
    action?.();
  }, []);

  return { isModalOpen, guardAction, closeModal, proceedWithPendingAction };
}
