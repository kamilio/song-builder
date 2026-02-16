/**
 * Context for sharing POE balance state across the component tree.
 *
 * US-024: A single balance state lives at the app root so that:
 * - Any page can trigger a balance refresh after an LLM call.
 * - The TopBar (and image home NavMenu area) reads the latest value.
 * - The value persists across navigations via localStorage (handled by usePoeBalance).
 */

import { createContext, useContext, ReactNode } from "react";
import { usePoeBalance } from "@/shared/hooks/usePoeBalance";

interface PoeBalanceContextValue {
  /** Last known formatted balance (e.g. "7K"), or null if never fetched. */
  balance: string | null;
  /**
   * Trigger a non-blocking balance refresh.
   * Call this after every LLM request completes.
   */
  refreshBalance: (apiKey: string | undefined | null) => void;
}

const PoeBalanceContext = createContext<PoeBalanceContextValue>({
  balance: null,
  refreshBalance: () => {},
});

export function PoeBalanceProvider({ children }: { children: ReactNode }) {
  const { balance, refreshBalance } = usePoeBalance();
  return (
    <PoeBalanceContext.Provider value={{ balance, refreshBalance }}>
      {children}
    </PoeBalanceContext.Provider>
  );
}

/** Access the POE balance from any component inside PoeBalanceProvider. */
export function usePoeBalanceContext(): PoeBalanceContextValue {
  return useContext(PoeBalanceContext);
}
