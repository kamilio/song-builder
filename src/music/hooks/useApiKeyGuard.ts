import { useState } from "react";
import { getSettings } from "@/music/lib/storage/storageService";

/**
 * Hook that provides API key guard functionality.
 *
 * Returns:
 * - `isModalOpen`: whether the "API key missing" modal should be shown
 * - `guardAction`: call this before any generation action — if the API key
 *   is absent it opens the modal and returns false; otherwise returns true
 * - `closeModal`: call this to dismiss the modal
 *
 * Behaviour is consistent whether VITE_USE_MOCK_LLM is true or false:
 * the modal still shows when POE_API_KEY is absent in both modes.
 */
export function useApiKeyGuard() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  function guardAction(): boolean {
    const settings = getSettings();
    const hasKey = Boolean(settings?.poeApiKey);
    if (!hasKey) {
      setIsModalOpen(true);
      return false;
    }
    return true;
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  return { isModalOpen, guardAction, closeModal };
}
